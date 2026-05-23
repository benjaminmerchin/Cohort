import type { PersonaId } from "./personas";

export type Severity = "low" | "medium" | "high" | "critical";

export interface FrictionLog {
  persona: PersonaId;
  severity: Severity;
  description: string;
  location: string;
  step: number;
}

export type Outcome = "completed" | "abandoned" | "timed_out";

export type RunEvent =
  | { type: "run_start"; url: string; goal: string }
  | { type: "persona_start"; persona: PersonaId }
  | { type: "step_start"; persona: PersonaId; step: number }
  | { type: "monologue"; persona: PersonaId; step: number; text: string }
  | {
      type: "action";
      persona: PersonaId;
      step: number;
      tool: string;
      args: unknown;
      ok: boolean;
      summary: string;
    }
  | { type: "screenshot"; persona: PersonaId; step: number; dataUrl: string; pageUrl: string; pageTitle: string }
  | {
      type: "friction";
      persona: PersonaId;
      step: number;
      severity: Severity;
      description: string;
      location: string;
    }
  | { type: "persona_end"; persona: PersonaId; outcome: Outcome; summary: string }
  | { type: "reconciliation_start" }
  | { type: "reconciliation_done"; report: ReconciliationReport }
  | { type: "error"; persona?: PersonaId; message: string }
  | { type: "run_done" };

export interface PrioritizedFix {
  rank: number;
  title: string;
  description: string;
  severity: Severity;
  affectedPersonas: PersonaId[];
  losing: string;
}

export interface ConflictInsight {
  title: string;
  description: string;
  perPersona: Record<string, string>;
}

export interface ReconciliationReport {
  headline: string;
  prioritizedFixes: PrioritizedFix[];
  conflicts: ConflictInsight[];
  segmentsAtRisk: { persona: PersonaId; risk: string }[];
}
