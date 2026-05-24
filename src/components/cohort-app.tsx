"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  FolderCode,
  GitBranch,
  Globe,
  LogOut,
  Play,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PersonaCam, type PersonaState } from "@/components/persona-cam";
import { ReportView } from "@/components/report-view";
import { ApplyModal } from "@/components/apply-modal";
import { PERSONA_ORDER, PERSONAS, type PersonaId } from "@/lib/personas";
import { useAuth } from "@/lib/auth";
import type { FrictionLog, PrioritizedFix, ReconciliationReport, RunEvent } from "@/lib/events";

function initialState(persona: PersonaId): PersonaState {
  return {
    persona,
    status: "idle",
    step: 0,
    monologue: [],
    actions: [],
    frictions: [],
  };
}

const DEMO_GOAL = "Try to buy something on this site, end-to-end.";

const MAX_MONOLOGUE = 12;
const MAX_ACTIONS = 30;
const MAX_FRICTIONS = 12;
function trim<T>(arr: T[], max: number): T[] {
  return arr.length <= max ? arr : arr.slice(-max);
}

export function CohortApp() {
  const { user, signOut } = useAuth();
  const displayName = user?.name ?? "you";
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState(DEMO_GOAL);
  const [repoPath, setRepoPath] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "reconciling" | "done">("idle");
  const [reconciling, setReconciling] = useState(false);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<PersonaId, PersonaState>>(() =>
    Object.fromEntries(PERSONA_ORDER.map((p) => [p, initialState(p)])) as Record<PersonaId, PersonaState>,
  );
  const [selectedRanks, setSelectedRanks] = useState<Set<number>>(new Set());
  const [applyOpen, setApplyOpen] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const toggleRank = useCallback((rank: number) => {
    setSelectedRanks((prev) => {
      const next = new Set(prev);
      if (next.has(rank)) next.delete(rank);
      else next.add(rank);
      return next;
    });
  }, []);

  const selectedFixes: PrioritizedFix[] = report
    ? report.prioritizedFixes.filter((f) => selectedRanks.has(f.rank))
    : [];

  const updatePersona = useCallback((persona: PersonaId, patch: (s: PersonaState) => PersonaState) => {
    setStates((prev) => ({ ...prev, [persona]: patch(prev[persona]) }));
  }, []);

  const stop = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  const start = useCallback(
    (targetUrl: string, targetGoal: string) => {
      stop();
      setError(null);
      setReport(null);
      setReconciling(false);
      setSelectedRanks(new Set());
      setStates(
        Object.fromEntries(
          PERSONA_ORDER.map((p) => [p, { ...initialState(p), status: "running" as const }]),
        ) as Record<PersonaId, PersonaState>,
      );
      setPhase("running");

      const qs = new URLSearchParams({ url: targetUrl, goal: targetGoal });
      const es = new EventSource(`/api/run?${qs.toString()}`);
      sourceRef.current = es;

      const handle = (evt: MessageEvent) => {
        let data: RunEvent;
        try {
          data = JSON.parse(evt.data) as RunEvent;
        } catch {
          return;
        }
        switch (data.type) {
          case "run_start":
            break;
          case "persona_start":
            updatePersona(data.persona, (s) => ({ ...s, status: "running" }));
            break;
          case "step_start":
            updatePersona(data.persona, (s) => ({ ...s, step: data.step }));
            break;
          case "monologue":
            updatePersona(data.persona, (s) => ({
              ...s,
              monologue: trim([...s.monologue, { step: data.step, text: data.text }], MAX_MONOLOGUE),
            }));
            break;
          case "action":
            updatePersona(data.persona, (s) => ({
              ...s,
              actions: trim(
                [...s.actions, { step: data.step, tool: data.tool, summary: data.summary, ok: data.ok }],
                MAX_ACTIONS,
              ),
            }));
            break;
          case "screenshot":
            updatePersona(data.persona, (s) => ({
              ...s,
              screenshot: { dataUrl: data.dataUrl, pageTitle: data.pageTitle, pageUrl: data.pageUrl },
              step: data.step,
            }));
            break;
          case "friction": {
            const friction: FrictionLog = {
              persona: data.persona,
              severity: data.severity,
              description: data.description,
              location: data.location,
              step: data.step,
            };
            updatePersona(data.persona, (s) => ({
              ...s,
              frictions: trim([...s.frictions, friction], MAX_FRICTIONS),
            }));
            break;
          }
          case "persona_end":
            updatePersona(data.persona, (s) => ({
              ...s,
              status: data.outcome === "completed" ? "completed" : "abandoned",
              finalSummary: data.summary,
            }));
            break;
          case "reconciliation_start":
            setReconciling(true);
            setPhase("reconciling");
            break;
          case "reconciliation_done":
            setReport(data.report);
            setReconciling(false);
            setPhase("done");
            break;
          case "error":
            if (data.persona) {
              updatePersona(data.persona, (s) => ({ ...s, status: "error", finalSummary: data.message }));
            } else {
              setError(data.message);
            }
            break;
          case "run_done":
            es.close();
            break;
        }
      };

      for (const t of [
        "run_start",
        "persona_start",
        "step_start",
        "monologue",
        "action",
        "screenshot",
        "friction",
        "persona_end",
        "reconciliation_start",
        "reconciliation_done",
        "error",
        "run_done",
      ]) {
        es.addEventListener(t, handle as EventListener);
      }

      es.addEventListener("fatal", () => {
        es.close();
        sourceRef.current = null;
      });

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          setError("Stream disconnected.");
          return;
        }
        es.close();
        sourceRef.current = null;
        setError("Stream error. Refresh to try again.");
      };
    },
    [stop, updatePersona],
  );

  useEffect(() => () => stop(), [stop]);

  const onDeploy = () => {
    const u = url.trim();
    if (!u) return;
    const fullUrl = /^https?:\/\//i.test(u) ? u : `https://${u}`;
    start(fullUrl, goal.trim() || DEMO_GOAL);
  };

  const onDemo = () => {
    const demoUrl = `${window.location.origin}/demo-site/index.html`;
    setUrl(demoUrl);
    setGoal(DEMO_GOAL);
    start(demoUrl, DEMO_GOAL);
  };

  const isRunning = phase === "running" || phase === "reconciling";

  return (
    <div className="relative flex min-h-screen flex-col bg-black text-white">
      <header className="sticky top-0 z-30 w-full border-b border-white/5 bg-black/90">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg border border-white/15 bg-white/[0.04]">
              <Bot className="size-3.5 text-white" />
            </div>
            <a href="/" className="text-sm font-semibold tracking-[0.18em] text-white">COHORT</a>
            <Badge variant="outline" className="ml-2 hidden md:inline-flex">
              Gemini 3.5 · Managed Agents
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  stop();
                  setPhase("idle");
                }}
              >
                <Square className="size-3.5" />
                Stop run
              </Button>
            )}
            {!isRunning && (
              <a
                href="https://github.com/benjaminmerchin/Cohort"
                className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white sm:inline-flex"
              >
                <GitBranch className="size-3.5" />
                github
              </a>
            )}
            <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 sm:inline-flex">
              <span className="grid size-5 place-items-center rounded-full bg-white/15 text-[10px] font-semibold uppercase text-white">
                {displayName.slice(0, 1)}
              </span>
              <span>{displayName}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={signOut} aria-label="Sign out">
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {phase === "idle" && (
        <section className="relative isolate overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/3 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.04] blur-3xl" />
          </div>
          <div className="relative z-10 mx-auto w-full max-w-3xl px-6 py-20 md:py-28">
            <div className="mb-6 flex justify-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-medium text-white/70">
                <span className="relative inline-flex size-1.5 rounded-full bg-white" />
                ON AIR · 3 personas standing by
              </div>
            </div>

            <h1 className="text-balance text-center text-5xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-6xl">
              Your site, through a{" "}
              <span className="font-serif italic font-normal">cohort</span> of users.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-balance text-center text-white/60 md:text-lg">
              Cohort deploys distinct AI personas that autonomously browse your site,
              try to complete goals, and report where the experience breaks — then
              reconciles their conflicting feedback into a prioritized, segment-aware report.
            </p>

            <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                target site
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3">
                <Globe className="size-4 text-white/40" />
                <Input
                  className="border-0 bg-transparent px-0 focus:border-0"
                  placeholder="example.com or https://your-app.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onDeploy()}
                />
              </div>

              <p className="mb-3 mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                what should the personas try to do?
              </p>
              <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={DEMO_GOAL} />

              <p className="mb-3 mt-5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                <span>local repo path (optional)</span>
                <span className="text-white/30 normal-case tracking-normal">
                  enables one-click fixes via claude code
                </span>
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3">
                <FolderCode className="size-4 text-white/40" />
                <Input
                  className="border-0 bg-transparent px-0 focus:border-0"
                  placeholder="/Users/you/dev/your-project"
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                />
              </div>

              <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={onDemo}
                  className="group inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 text-xs text-white/70 hover:bg-white/[0.06] hover:text-white"
                >
                  <Sparkles className="size-3.5" />
                  Try with our deliberately-broken demo site
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </button>

                <Button size="lg" onClick={onDeploy} disabled={!url.trim()}>
                  <Play className="size-4 fill-current" />
                  Deploy cohort
                </Button>
              </div>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-3">
              {PERSONA_ORDER.map((pid) => {
                const p = PERSONAS[pid];
                return (
                  <div key={pid} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-lg">{p.emoji}</span>
                      <span className="text-sm font-semibold text-white">{p.name}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-white/55">{p.oneLine}</p>
                  </div>
                );
              })}
            </div>

            <p className="mt-12 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
              Built at Google I/O hackathon · powered by Gemini 3.5 · Managed Agents · Playwright
            </p>
          </div>
        </section>
      )}

      {phase !== "idle" && (
        <section className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                cohort run
              </p>
              <h2 className="mt-1 text-balance text-2xl font-semibold tracking-tight md:text-3xl">
                Testing <span className="font-mono text-white/80">{url || "(demo site)"}</span>
              </h2>
              <p className="mt-1 text-sm text-white/55">Goal: {goal}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {phase === "running" && (
                <Badge variant="live">
                  <span className="relative mr-1 inline-flex size-1.5 rounded-full bg-red-400" />
                  PERSONAS RUNNING
                </Badge>
              )}
              {phase === "reconciling" && <Badge variant="warning">SYNTHESIZING REPORT…</Badge>}
              {phase === "done" && <Badge variant="success">RUN COMPLETE</Badge>}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {PERSONA_ORDER.map((pid) => (
              <PersonaCam key={pid} state={states[pid]} />
            ))}
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4 text-sm text-red-200">
              {error}
            </div>
          )}

          {reconciling && (
            <div className="mt-10 rounded-3xl border border-white/10 bg-white/[0.02] p-8 text-center">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
                principal agent
              </p>
              <p className="font-serif text-xl italic text-white/70">
                reconciling{" "}
                {Object.values(states).reduce((n, s) => n + s.frictions.length, 0)} friction
                reports across {PERSONA_ORDER.length} personas…
              </p>
            </div>
          )}

          {report && (
            <div className="mt-10">
              <ReportView
                report={report}
                selectedRanks={repoPath.trim() ? selectedRanks : undefined}
                onToggleRank={repoPath.trim() ? toggleRank : undefined}
              />
            </div>
          )}

          {report && repoPath.trim() && selectedFixes.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/95 px-6 py-4">
              <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
                <div className="text-sm text-white/70">
                  <span className="font-semibold text-white">
                    {selectedFixes.length} fix{selectedFixes.length === 1 ? "" : "es"}
                  </span>{" "}
                  selected · target:{" "}
                  <span className="font-mono text-white/80">{repoPath}</span>
                </div>
                <Button onClick={() => setApplyOpen(true)}>
                  <Wrench className="size-4" />
                  Apply with Claude Code
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {report && (
        <ApplyModal
          open={applyOpen}
          repoPath={repoPath.trim()}
          targetUrl={url}
          fixes={selectedFixes}
          onClose={() => setApplyOpen(false)}
        />
      )}

      <footer className="mt-auto border-t border-white/5">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 text-[11px] text-white/40">
          <span className="font-mono uppercase tracking-[0.18em]">Cohort · CH 00 · MAIN</span>
          <span>Built with Gemini 3.5 · Managed Agents · Playwright · Next.js</span>
        </div>
      </footer>
    </div>
  );
}
