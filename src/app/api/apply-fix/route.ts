import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { PrioritizedFix } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ApplyRequest {
  repoPath: string;
  targetUrl?: string;
  fixes: PrioritizedFix[];
}

type StreamEvent =
  | { type: "started"; repoPath: string; fixCount: number }
  | { type: "stdout"; line: string }
  | { type: "stderr"; line: string }
  | { type: "message"; role: "assistant" | "user"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; text: string; isError: boolean }
  | { type: "done"; exitCode: number }
  | { type: "error"; message: string };

function sseChunk(evt: StreamEvent): string {
  return `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;
}

function buildPrompt(fixes: PrioritizedFix[], targetUrl?: string): string {
  const intro = [
    `A multi-persona user-testing run (Cohort) just finished on ${targetUrl ?? "this website"}.`,
    `Three AI personas — a confused first-timer, a power user, and an accessibility user — autonomously`,
    `browsed the site and reported these UX issues to fix. Your job is to fix them in the codebase of the`,
    `current working directory.`,
    ``,
    `Rules:`,
    `1. Identify which file(s) own each issue. Read before editing.`,
    `2. Make the MINIMUM edits needed to fix each issue — don't refactor unrelated code.`,
    `3. Do NOT commit. Leave the changes staged or unstaged for the human to review.`,
    `4. When finished, briefly list what you changed per fix.`,
    ``,
    `Issues to fix (in priority order):`,
    ``,
  ].join("\n");

  const body = fixes
    .map((f, i) => {
      const personas = (f.affectedPersonas ?? []).join(", ");
      return [
        `### Fix ${i + 1} — [${f.severity.toUpperCase()}] ${f.title}`,
        `Affects: ${personas || "(unspecified)"}`,
        `What you're losing if you don't fix this: ${f.losing}`,
        ``,
        f.description,
      ].join("\n");
    })
    .join("\n\n");

  return intro + body;
}

export async function POST(req: NextRequest) {
  let body: ApplyRequest;
  try {
    body = (await req.json()) as ApplyRequest;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (!body.repoPath || typeof body.repoPath !== "string") {
    return new Response("Missing repoPath", { status: 400 });
  }
  if (!Array.isArray(body.fixes) || body.fixes.length === 0) {
    return new Response("No fixes selected", { status: 400 });
  }

  const repoPath = resolvePath(body.repoPath.replace(/^~/, process.env.HOME ?? ""));
  if (!existsSync(repoPath)) {
    return new Response(`Repo path does not exist: ${repoPath}`, { status: 400 });
  }
  try {
    if (!statSync(repoPath).isDirectory()) {
      return new Response(`Repo path is not a directory: ${repoPath}`, { status: 400 });
    }
  } catch {
    return new Response(`Cannot stat repo path: ${repoPath}`, { status: 400 });
  }

  const prompt = buildPrompt(body.fixes, body.targetUrl);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (evt: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseChunk(evt)));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      send({ type: "started", repoPath, fixCount: body.fixes.length });

      // Headless Claude Code invocation.
      // --permission-mode acceptEdits = auto-approve file edits (still asks for shell/web/etc.)
      // --output-format stream-json = emit one JSON event per line as Claude works
      // --include-partial-messages = flush partial text chunks for live feedback
      const child = spawn(
        "claude",
        [
          "-p",
          prompt,
          "--permission-mode",
          "acceptEdits",
          "--output-format",
          "stream-json",
          "--include-partial-messages",
          "--verbose",
          "--no-session-persistence",
        ],
        { cwd: repoPath, stdio: ["ignore", "pipe", "pipe"] },
      );

      // If the client disconnects, kill the claude process.
      const onAbort = () => {
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
        close();
      };
      req.signal.addEventListener("abort", onAbort);

      let stdoutBuf = "";
      let stderrBuf = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString("utf8");
        let nl: number;
        while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
          const line = stdoutBuf.slice(0, nl).trim();
          stdoutBuf = stdoutBuf.slice(nl + 1);
          if (!line) continue;
          // Try to parse stream-json events; fall back to raw stdout line.
          try {
            const evt = JSON.parse(line) as Record<string, unknown>;
            translateClaudeEvent(evt, send);
          } catch {
            send({ type: "stdout", line });
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString("utf8");
        let nl: number;
        while ((nl = stderrBuf.indexOf("\n")) >= 0) {
          const line = stderrBuf.slice(0, nl).trim();
          stderrBuf = stderrBuf.slice(nl + 1);
          if (line) send({ type: "stderr", line });
        }
      });

      child.on("error", (e) => {
        send({ type: "error", message: e.message });
        close();
      });

      child.on("close", (code) => {
        if (stdoutBuf.trim()) send({ type: "stdout", line: stdoutBuf.trim() });
        if (stderrBuf.trim()) send({ type: "stderr", line: stderrBuf.trim() });
        req.signal.removeEventListener("abort", onAbort);
        send({ type: "done", exitCode: code ?? 0 });
        close();
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Translate Claude Code stream-json events into our own friendlier stream.
 * The shape of stream-json events varies (system, assistant, user, result,
 * tool_use, tool_result, etc.) — we extract the high-value bits and skip
 * the rest.
 */
function translateClaudeEvent(evt: Record<string, unknown>, send: (e: StreamEvent) => void) {
  const t = String(evt.type ?? "");
  if (t === "assistant" || t === "user") {
    const msg = evt.message as { content?: Array<{ type?: string; text?: string; name?: string; input?: unknown; content?: string }> } | undefined;
    const contents = msg?.content ?? [];
    for (const c of contents) {
      if (c.type === "text" && c.text) {
        send({ type: "message", role: t as "assistant" | "user", text: c.text });
      } else if (c.type === "tool_use") {
        send({ type: "tool_use", name: c.name ?? "?", input: c.input });
      } else if (c.type === "tool_result") {
        send({
          type: "tool_result",
          text: typeof c.content === "string" ? c.content : JSON.stringify(c.content).slice(0, 400),
          isError: false,
        });
      }
    }
    return;
  }
  if (t === "result") {
    const text = String((evt as { result?: string }).result ?? "");
    if (text) send({ type: "message", role: "assistant", text });
    return;
  }
  // Stream-partial / system events: pass through as a single-line stdout for visibility.
  if (t === "stream_event" || t === "system") return;
}
