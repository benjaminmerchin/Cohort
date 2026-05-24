"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Terminal, Wrench, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PrioritizedFix } from "@/lib/events";

interface ApplyModalProps {
  open: boolean;
  repoPath: string;
  targetUrl: string;
  fixes: PrioritizedFix[];
  onClose: () => void;
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

interface LogEntry {
  kind: "info" | "thought" | "tool" | "tool-result" | "stdout" | "stderr" | "error" | "done";
  text: string;
  meta?: string;
}

const MAX_LOG = 200;

export function ApplyModal({ open, repoPath, targetUrl, fixes, onClose }: ApplyModalProps) {
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<{ exitCode: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const append = (entry: LogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_LOG ? next.slice(-MAX_LOG) : next;
    });
  };

  useEffect(() => {
    if (!open || running || done) return;
    let cancelled = false;
    setRunning(true);
    setError(null);
    setLogs([]);

    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        const res = await fetch("/api/apply-fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoPath, targetUrl, fixes }),
          signal: ac.signal,
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => `HTTP ${res.status}`);
          if (!cancelled) {
            setError(msg);
            setRunning(false);
          }
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) {
          setError("No stream from server.");
          setRunning(false);
          return;
        }
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done: streamDone } = await reader.read();
          if (streamDone) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, nl);
            buf = buf.slice(nl + 2);
            const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
            if (!dataLine) continue;
            try {
              const evt = JSON.parse(dataLine.slice(5).trim()) as StreamEvent;
              handleEvent(evt);
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!cancelled) {
          setError((e as Error).message);
          setRunning(false);
        }
      }
    })();

    function handleEvent(evt: StreamEvent) {
      switch (evt.type) {
        case "started":
          append({ kind: "info", text: `Claude Code starting in ${evt.repoPath}`, meta: `${evt.fixCount} fixes` });
          break;
        case "message":
          append({ kind: "thought", text: evt.text, meta: evt.role });
          break;
        case "tool_use":
          append({
            kind: "tool",
            text: evt.name,
            meta: typeof evt.input === "object" ? JSON.stringify(evt.input).slice(0, 200) : String(evt.input).slice(0, 200),
          });
          break;
        case "tool_result":
          append({ kind: "tool-result", text: evt.text.slice(0, 400) });
          break;
        case "stdout":
          append({ kind: "stdout", text: evt.line });
          break;
        case "stderr":
          append({ kind: "stderr", text: evt.line });
          break;
        case "error":
          append({ kind: "error", text: evt.message });
          setError(evt.message);
          setRunning(false);
          break;
        case "done":
          append({
            kind: "done",
            text: evt.exitCode === 0 ? "Claude Code finished successfully." : `Claude Code exited with code ${evt.exitCode}.`,
          });
          setDone({ exitCode: evt.exitCode });
          setRunning(false);
          break;
      }
    }

    return () => {
      cancelled = true;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logs.length]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 md:items-center">
      <div className="relative flex h-[78vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-white/15 bg-white/[0.04]">
              <Wrench className="size-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Apply with Claude Code</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                {fixes.length} fix{fixes.length === 1 ? "" : "es"} · {repoPath}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {running && (
              <Badge variant="warning">
                <Loader2 className="mr-1 size-3 animate-spin" /> RUNNING
              </Badge>
            )}
            {done?.exitCode === 0 && <Badge variant="success">DONE</Badge>}
            {done && done.exitCode !== 0 && <Badge variant="critical">EXIT {done.exitCode}</Badge>}
            {error && <Badge variant="critical">ERROR</Badge>}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                abortRef.current?.abort();
                onClose();
              }}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Fixes summary */}
        <div className="border-b border-white/5 px-5 py-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">applying</p>
          <ul className="space-y-1.5">
            {fixes.map((f) => (
              <li key={f.rank} className="flex items-start gap-2 text-xs text-white/75">
                <span className="mt-0.5 font-mono text-white/40">#{f.rank}</span>
                <Badge variant={f.severity} className="shrink-0 px-1.5 py-0">
                  {f.severity}
                </Badge>
                <span className="truncate">{f.title}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Log */}
        <div className="min-h-0 flex-1 overflow-hidden bg-black">
          <div ref={logRef} className="h-full overflow-y-auto px-5 py-4 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 && (
              <div className="flex items-center gap-2 text-white/40">
                <Loader2 className="size-3 animate-spin" />
                spawning <code>claude</code>…
              </div>
            )}
            {logs.map((l, i) => (
              <LogLine key={i} entry={l} />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/5 px-5 py-3 text-[11px] text-white/50">
          <div className="flex items-center gap-2">
            <Terminal className="size-3.5" />
            {running ? "Streaming Claude Code output…" : done ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300/80">
                <CheckCircle2 className="size-3.5" />
                Review the changes in your editor (no commit was made).
              </span>
            ) : error ? (
              <span className="text-red-300">{error}</span>
            ) : (
              "ready"
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => { abortRef.current?.abort(); onClose(); }}>
            {running ? "Cancel" : "Close"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const palette: Record<LogEntry["kind"], string> = {
    info: "text-white/70",
    thought: "text-white/90",
    tool: "text-violet-300",
    "tool-result": "text-emerald-300/80",
    stdout: "text-white/55",
    stderr: "text-amber-300/80",
    error: "text-red-300",
    done: "text-emerald-300",
  };
  const prefix: Record<LogEntry["kind"], string> = {
    info: "·",
    thought: "›",
    tool: "▸",
    "tool-result": "↩",
    stdout: " ",
    stderr: "!",
    error: "✕",
    done: "✓",
  };
  return (
    <div className={`mb-1 ${palette[entry.kind]}`}>
      <span className="mr-2 text-white/30">{prefix[entry.kind]}</span>
      {entry.kind === "thought" ? (
        <span className="whitespace-pre-wrap">{entry.text}</span>
      ) : (
        <>
          <span>{entry.text}</span>
          {entry.meta && <span className="ml-2 text-white/30">{entry.meta}</span>}
        </>
      )}
    </div>
  );
}
