"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, MousePointerClick, ScrollText, Type as TypeIcon, Eye, Flag, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import type { PersonaId } from "@/lib/personas";
import { PERSONAS } from "@/lib/personas";
import type { FrictionLog, Severity } from "@/lib/events";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface MonologueEntry {
  step: number;
  text: string;
}
export interface ActionEntry {
  step: number;
  tool: string;
  summary: string;
  ok: boolean;
}

export interface PersonaState {
  persona: PersonaId;
  status: "idle" | "running" | "completed" | "abandoned" | "error";
  step: number;
  screenshot?: { dataUrl: string; pageTitle: string; pageUrl: string };
  monologue: MonologueEntry[];
  actions: ActionEntry[];
  frictions: FrictionLog[];
  finalSummary?: string;
}

function severityVariant(s: Severity): "critical" | "high" | "medium" | "low" {
  return s;
}

function toolIcon(tool: string) {
  switch (tool) {
    case "observe":
      return <Eye className="size-3" />;
    case "click":
      return <MousePointerClick className="size-3" />;
    case "type":
      return <TypeIcon className="size-3" />;
    case "scroll":
      return <ScrollText className="size-3" />;
    case "report_friction":
      return <Flag className="size-3" />;
    case "complete_goal":
      return <CheckCircle2 className="size-3" />;
    case "abandon":
      return <XCircle className="size-3" />;
    default:
      return <ArrowRight className="size-3" />;
  }
}

export function PersonaCam({ state }: { state: PersonaState }) {
  const p = PERSONAS[state.persona];
  const monologueRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    monologueRef.current?.scrollTo({ top: monologueRef.current.scrollHeight, behavior: "smooth" });
  }, [state.monologue.length]);
  useEffect(() => {
    actionsRef.current?.scrollTo({ top: actionsRef.current.scrollHeight, behavior: "smooth" });
  }, [state.actions.length]);

  const isLive = state.status === "running";
  const isDone = state.status === "completed" || state.status === "abandoned";

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={cn("grid size-9 place-items-center rounded-xl border border-white/15 bg-gradient-to-br text-lg", p.accent)}>
            <span>{p.emoji}</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight text-white">{p.name}</div>
            <div className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              CH 0{Object.keys(PERSONAS).indexOf(state.persona) + 1} · {state.persona}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <Badge variant="live" className="gap-1.5">
              <span className="relative inline-flex size-1.5 rounded-full bg-red-400" />
              LIVE
            </Badge>
          )}
          {state.status === "completed" && <Badge variant="success">COMPLETED</Badge>}
          {state.status === "abandoned" && <Badge variant="warning">ABANDONED</Badge>}
          {state.status === "error" && <Badge variant="critical">ERROR</Badge>}
          {state.status === "idle" && <Badge variant="outline">STANDBY</Badge>}
        </div>
      </div>

      {/* Persona one-liner */}
      <div className="px-4 pb-2 pt-3 text-xs text-white/50">{p.oneLine}</div>

      {/* Screenshot */}
      <div className="relative mx-3 aspect-[16/10] overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {state.screenshot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={state.screenshot.dataUrl}
            alt={state.screenshot.pageTitle}
            className="absolute inset-0 size-full object-cover object-top"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white/30">
            <span className="font-mono text-xs uppercase tracking-[0.18em]">awaiting feed</span>
          </div>
        )}
        {state.screenshot && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
            <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/60">
              {state.screenshot.pageTitle || state.screenshot.pageUrl}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              step {state.step}
            </span>
          </div>
        )}
      </div>

      {/* Monologue */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col px-4 pb-4">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          internal monologue
        </p>
        <div
          ref={monologueRef}
          className="mb-3 max-h-32 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-3 text-xs text-white/80"
        >
          {state.monologue.length === 0 ? (
            <span className="italic text-white/30">…</span>
          ) : (
            state.monologue.map((m, i) => (
              <div key={i} className="mb-1.5 last:mb-0">
                <span className="mr-2 font-mono text-[10px] text-white/30">[{m.step}]</span>
                <span className="font-serif italic">{m.text}</span>
              </div>
            ))
          )}
        </div>

        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          actions
        </p>
        <div
          ref={actionsRef}
          className="mb-3 max-h-24 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-2 text-[11px] text-white/70"
        >
          {state.actions.length === 0 ? (
            <span className="italic text-white/30">…</span>
          ) : (
            state.actions.map((a, i) => (
              <div key={i} className={cn("mb-0.5 flex items-center gap-1.5 last:mb-0", !a.ok && "text-red-300/70")}>
                <span className="font-mono text-[10px] text-white/30">[{a.step}]</span>
                <span className="text-white/50">{toolIcon(a.tool)}</span>
                <span className="truncate">{a.summary}</span>
              </div>
            ))
          )}
        </div>

        <p className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
          <span>frictions</span>
          {state.frictions.length > 0 && (
            <span className="text-white/60">{state.frictions.length}</span>
          )}
        </p>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-white/5 bg-black/30 p-2">
          {state.frictions.length === 0 ? (
            <span className="block px-1 py-2 text-[11px] italic text-white/30">no frictions yet</span>
          ) : (
            state.frictions.map((f, i) => (
              <div key={i} className="mb-2 last:mb-0 rounded-md border border-white/5 bg-white/[0.02] p-2">
                <div className="mb-1 flex items-center gap-1.5">
                  <Badge variant={severityVariant(f.severity)} className="px-1.5 py-0">
                    {f.severity}
                  </Badge>
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                    {f.location}
                  </span>
                </div>
                <p className="text-[11px] leading-snug text-white/80">{f.description}</p>
              </div>
            ))
          )}
        </div>

        {isDone && state.finalSummary && (
          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/75">
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
              {state.status === "completed" ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
              final report
            </div>
            <p className="leading-snug">{state.finalSummary}</p>
          </div>
        )}
      </div>
    </div>
  );
}
