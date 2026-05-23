import {
  createInteractionWithFallback,
  MODEL_ID,
  RECONCILIATION_SCHEMA,
} from "./gemini";
import { runPersona, type PersonaRunResult } from "./agent";
import { PERSONAS, PERSONA_ORDER, type PersonaId } from "./personas";
import type {
  PrioritizedFix,
  ReconciliationReport,
  RunEvent,
} from "./events";

export interface RunOptions {
  url: string;
  goal: string;
  personas?: PersonaId[];
  signal?: AbortSignal;
  onEvent: (e: RunEvent) => void;
}

export async function runCohort(opts: RunOptions): Promise<{
  results: PersonaRunResult[];
  report: ReconciliationReport;
}> {
  const personas = opts.personas ?? PERSONA_ORDER;
  opts.onEvent({ type: "run_start", url: opts.url, goal: opts.goal });

  // Run all personas in parallel. Each gets its own browser context. The
  // shared AbortSignal lets every persona's step loop bail out cleanly.
  const results = await Promise.all(
    personas.map((pid) =>
      runPersona({
        persona: pid,
        url: opts.url,
        goal: opts.goal,
        signal: opts.signal,
        onEvent: opts.onEvent,
      }).catch((e): PersonaRunResult => {
        opts.onEvent({ type: "error", persona: pid, message: (e as Error).message });
        return { persona: pid, outcome: "abandoned", summary: `Crashed: ${(e as Error).message}`, frictions: [], steps: 0 };
      }),
    ),
  );

  if (opts.signal?.aborted) {
    opts.onEvent({ type: "run_done" });
    return {
      results,
      report: {
        headline: "Run was aborted before reconciliation.",
        prioritizedFixes: [],
        conflicts: [],
        segmentsAtRisk: [],
      },
    };
  }

  opts.onEvent({ type: "reconciliation_start" });

  let report: ReconciliationReport;
  try {
    report = await reconcile(opts.url, opts.goal, results);
  } catch (e) {
    opts.onEvent({ type: "error", message: `Reconciliation failed: ${(e as Error).message}` });
    report = fallbackReport(results);
  }

  opts.onEvent({ type: "reconciliation_done", report });
  opts.onEvent({ type: "run_done" });

  return { results, report };
}

async function reconcile(
  url: string,
  goal: string,
  results: PersonaRunResult[],
): Promise<ReconciliationReport> {
  const personaSummaries = results.map((r) => {
    const persona = PERSONAS[r.persona];
    const fLines = r.frictions.length
      ? r.frictions
          .map(
            (f, i) =>
              `  ${i + 1}. [${f.severity.toUpperCase()}] @ ${f.location}: ${f.description}`,
          )
          .join("\n")
      : "  (no frictions logged)";
    return [
      `## ${persona.name} (${persona.id}) — outcome: ${r.outcome}`,
      `Persona: ${persona.oneLine}`,
      `Final summary: ${r.summary}`,
      `Steps: ${r.steps}`,
      `Frictions:`,
      fLines,
    ].join("\n");
  });

  const userText = [
    `You are the PRINCIPAL orchestrator of a multi-persona user-testing run on the site below.`,
    ``,
    `TARGET URL: ${url}`,
    `GOAL ALL PERSONAS PURSUED: ${goal}`,
    ``,
    `You received friction logs from ${results.length} distinct personas. Each persona`,
    `represents a different real-world user segment. Your job:`,
    ``,
    `1. Produce a PRIORITIZED list of fixes, ranked by (# personas hurt × max severity).`,
    `   Each fix names which personas it affects and "who you're losing" in segment language.`,
    `2. Surface CONFLICTS — places personas disagreed (e.g. Power User loved the dense layout,`,
    `   First-Timer was lost). Frame each as an explicit tradeoff.`,
    `3. Flag any SEGMENT AT RISK of abandoning entirely.`,
    `4. Open with a single punchy HEADLINE for the team to read first.`,
    ``,
    `Return ONLY valid JSON matching the schema. Be specific, blunt, and product-y.`,
    ``,
    `── Persona reports ──`,
    ``,
    ...personaSummaries,
  ].join("\n");

  const params = {
    model: MODEL_ID,
    input: [
      {
        type: "user_input" as const,
        content: [{ type: "text" as const, text: userText }],
      },
    ],
    system_instruction:
      "You are the principal user-research lead. You write tight, opinionated product reports. " +
      "You always respect the JSON schema you're given.",
    response_format: {
      type: "text" as const,
      mime_type: "application/json" as const,
      schema: RECONCILIATION_SCHEMA,
    },
  };

  const { interaction } = await createInteractionWithFallback(
    params as unknown as Parameters<typeof createInteractionWithFallback>[0],
  );
  const intAny = interaction as unknown as { output_text?: string; steps?: { type: string; content?: unknown[] }[] };
  const text = intAny.output_text ?? extractFirstText(intAny.steps ?? []);
  if (!text) throw new Error("No JSON returned from reconciliation.");

  let parsed: ReconciliationReport;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error(`Reconciliation returned non-JSON: ${text.slice(0, 200)}…`);
  }
  parsed.prioritizedFixes = (parsed.prioritizedFixes ?? [])
    .sort((a: PrioritizedFix, b: PrioritizedFix) => (a.rank ?? 99) - (b.rank ?? 99))
    .map((f: PrioritizedFix, i: number) => ({ ...f, rank: i + 1 }));
  parsed.conflicts = parsed.conflicts ?? [];
  parsed.segmentsAtRisk = parsed.segmentsAtRisk ?? [];
  return parsed;
}

function extractFirstText(steps: { type: string; content?: unknown[] }[]): string {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.type !== "model_output") continue;
    const content = (s.content ?? []) as Array<{ parts?: Array<{ text?: string }> }>;
    for (const c of content) {
      for (const p of c.parts ?? []) {
        if (p.text) return p.text;
      }
    }
  }
  return "";
}

function stripCodeFence(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function fallbackReport(results: PersonaRunResult[]): ReconciliationReport {
  const fixes: PrioritizedFix[] = [];
  let rank = 1;
  for (const r of results) {
    for (const f of r.frictions) {
      fixes.push({
        rank: rank++,
        title: f.description.slice(0, 80),
        description: f.description,
        severity: f.severity,
        affectedPersonas: [r.persona],
        losing: `${PERSONAS[r.persona].name} users`,
      });
    }
  }
  return {
    headline: "Reconciliation model unavailable — showing raw friction list.",
    prioritizedFixes: fixes,
    conflicts: [],
    segmentsAtRisk: results
      .filter((r) => r.outcome !== "completed")
      .map((r) => ({ persona: r.persona, risk: r.summary })),
  };
}
