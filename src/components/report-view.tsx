"use client";

import { ChevronRight, Flame, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PERSONAS } from "@/lib/personas";
import type { ReconciliationReport } from "@/lib/events";

export function ReportView({ report }: { report: ReconciliationReport }) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pb-24 pt-2">
      {/* Headline */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8">
        <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
          principal agent · synthesis
        </p>
        <h2 className="text-balance text-3xl font-semibold leading-tight tracking-[-0.02em] md:text-4xl">
          {report.headline}
        </h2>
      </div>

      {/* Prioritized fixes */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Flame className="size-4 text-red-400" />
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            Prioritized fixes
          </h3>
          <span className="text-xs text-white/40">
            ranked by # personas hurt × severity
          </span>
        </div>
        <div className="space-y-3">
          {report.prioritizedFixes.map((fix) => (
            <div
              key={fix.rank}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="flex items-start gap-4">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/[0.04] font-mono text-sm font-semibold text-white">
                  {fix.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold tracking-tight text-white">
                      {fix.title}
                    </h4>
                    <Badge variant={fix.severity}>{fix.severity}</Badge>
                    {fix.affectedPersonas.map((pid) => (
                      <Badge key={pid} variant="outline" className="lowercase">
                        {PERSONAS[pid]?.emoji ?? "·"} {PERSONAS[pid]?.name ?? pid}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed text-white/70">{fix.description}</p>
                  <p className="mt-3 flex items-start gap-2 text-xs text-white/50">
                    <ChevronRight className="mt-0.5 size-3 shrink-0" />
                    <span>
                      <span className="font-mono uppercase tracking-[0.14em] text-white/40">
                        losing:
                      </span>{" "}
                      {fix.losing}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Conflicts */}
      {report.conflicts.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Users className="size-4 text-violet-400" />
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
              Where personas disagreed
            </h3>
            <span className="text-xs text-white/40">explicit tradeoffs</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {report.conflicts.map((c, i) => (
              <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h4 className="mb-2 text-base font-semibold tracking-tight text-white">
                  <span className="font-serif italic font-normal text-white/80">tradeoff:</span>{" "}
                  {c.title}
                </h4>
                <p className="text-sm leading-relaxed text-white/70">{c.description}</p>
                <div className="mt-4 space-y-2">
                  {Object.entries(c.perPersona).map(([pid, said]) => {
                    const p = PERSONAS[pid as keyof typeof PERSONAS];
                    if (!p) return null;
                    return (
                      <div key={pid} className="flex gap-3 rounded-lg border border-white/5 bg-black/20 p-2.5">
                        <span className="text-base">{p.emoji}</span>
                        <div>
                          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">
                            {p.name}
                          </div>
                          <div className="text-xs italic text-white/75">{said}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Segments at risk */}
      {report.segmentsAtRisk.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
              Segments at risk of abandoning
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {report.segmentsAtRisk.map((s, i) => {
              const p = PERSONAS[s.persona];
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-lg">{p?.emoji}</span>
                    <span className="text-sm font-semibold text-white">{p?.name}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-amber-100/80">{s.risk}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
