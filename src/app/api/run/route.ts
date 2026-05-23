import { NextRequest } from "next/server";
import { runCohort } from "@/lib/orchestrator";
import { PERSONA_ORDER, type PersonaId } from "@/lib/personas";
import type { RunEvent } from "@/lib/events";
import {
  activeRunCount,
  MAX_CONCURRENT_RUNS,
  releaseRunSlot,
  tryReserveRunSlot,
} from "@/lib/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sseChunk(evt: RunEvent): string {
  return `event: ${evt.type}\ndata: ${JSON.stringify(evt)}\n\n`;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const goal = req.nextUrl.searchParams.get("goal") ?? "Browse the site and try to complete a typical task.";
  const personasParam = req.nextUrl.searchParams.get("personas");
  if (!url) {
    return new Response("Missing ?url=", { status: 400 });
  }
  const personas: PersonaId[] = personasParam
    ? (personasParam.split(",").map((s) => s.trim()).filter(Boolean) as PersonaId[])
    : PERSONA_ORDER;

  // Cap concurrent cohort runs across the process. Each run spawns up to
  // PERSONA_ORDER.length Playwright contexts — without a cap, page reloads
  // and SSE auto-reconnects would compound into many parallel runs.
  if (!tryReserveRunSlot()) {
    return new Response(
      JSON.stringify({
        error: "busy",
        message: `Another Cohort run is in progress (${activeRunCount()}/${MAX_CONCURRENT_RUNS}). Wait for it to finish.`,
      }),
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "30" } },
    );
  }

  const encoder = new TextEncoder();
  const controller = new AbortController();

  // Propagate client disconnect (browser tab closed, navigation, manual stop)
  // to the orchestrator so all 3 Playwright contexts shut down immediately
  // instead of finishing in the background.
  req.signal.addEventListener("abort", () => controller.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      let closed = false;
      const closeStream = (reason?: string) => {
        if (closed) return;
        closed = true;
        if (reason) {
          try {
            streamController.enqueue(encoder.encode(`event: fatal\ndata: ${JSON.stringify({ message: reason })}\n\n`));
          } catch {
            // ignore
          }
        }
        try {
          streamController.close();
        } catch {
          // already closed
        }
      };

      const send = (evt: RunEvent) => {
        if (closed) return;
        try {
          streamController.enqueue(encoder.encode(sseChunk(evt)));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          streamController.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          closed = true;
        }
      }, 15000);

      const onAbort = () => {
        clearInterval(heartbeat);
        closeStream();
      };
      req.signal.addEventListener("abort", onAbort);

      try {
        await runCohort({ url, goal, personas, signal: controller.signal, onEvent: send });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        clearInterval(heartbeat);
        releaseRunSlot();
        req.signal.removeEventListener("abort", onAbort);
        // Emit a `fatal` event before closing — the client uses this as a
        // signal NOT to auto-reconnect (otherwise Chrome's EventSource would
        // reopen the stream and start a brand-new cohort run).
        closeStream("Run complete or aborted.");
      }
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
