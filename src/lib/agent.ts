import {
  createInteractionWithFallback,
  MODEL_ID,
  PERSONA_TOOLS,
} from "./gemini";
import { PERSONAS, type PersonaId } from "./personas";
import {
  openSession,
  tool_click,
  tool_navigate,
  tool_observe,
  tool_scroll,
  tool_type,
  type ObserveResult,
} from "./browser";
import type { FrictionLog, Outcome, RunEvent } from "./events";

export interface PersonaRunResult {
  persona: PersonaId;
  outcome: Outcome;
  summary: string;
  frictions: FrictionLog[];
  steps: number;
}

export interface PersonaRunInput {
  persona: PersonaId;
  url: string;
  goal: string;
  maxSteps?: number;
  signal?: AbortSignal;
  onEvent: (evt: RunEvent) => void;
}

const MAX_STEPS = Number(process.env.COHORT_MAX_STEPS ?? 8);

interface FunctionCallStep {
  type: "function_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ModelOutputStep {
  type: "model_output";
  content?: Array<{ role?: string; parts?: Array<{ text?: string }> }>;
}

type AnyStep = { type: string; [k: string]: unknown };

function isAborted(signal?: AbortSignal): boolean {
  return !!signal && signal.aborted;
}

/**
 * Run one persona end-to-end against `input.url` using the Gemini Managed
 * Agents Interactions API. The harness drives the step protocol; we execute
 * the function calls (observe/click/type/...) and feed FunctionResultSteps
 * back via `previous_interaction_id`. Every browser context is guaranteed
 * to close via try/finally, even on abort or thrown errors.
 */
export async function runPersona(input: PersonaRunInput): Promise<PersonaRunResult> {
  const persona = PERSONAS[input.persona];
  const onEvent = input.onEvent;
  const maxSteps = input.maxSteps ?? MAX_STEPS;
  const signal = input.signal;
  const frictions: FrictionLog[] = [];

  onEvent({ type: "persona_start", persona: persona.id });

  const session = await openSession();

  try {
    if (isAborted(signal)) {
      return { persona: persona.id, outcome: "abandoned", summary: "Aborted before start.", frictions, steps: 0 };
    }

    const nav = await tool_navigate(session, input.url);
    if (!nav.ok) {
      onEvent({ type: "error", persona: persona.id, message: `Could not navigate: ${nav.error}` });
      return { persona: persona.id, outcome: "abandoned", summary: "Failed to load site.", frictions, steps: 0 };
    }

    const firstObserve = await tool_observe(session);
    onEvent({
      type: "screenshot",
      persona: persona.id,
      step: 0,
      dataUrl: `data:${firstObserve.screenshotMime};base64,${firstObserve.screenshot}`,
      pageUrl: firstObserve.url,
      pageTitle: firstObserve.title,
    });

    const initialInput = [
      {
        type: "user_input" as const,
        content: [
          { type: "text" as const, text: buildOpeningPrompt(input.goal, firstObserve) },
          {
            type: "image" as const,
            data: firstObserve.screenshot,
            mime_type: firstObserve.screenshotMime,
          },
        ],
      },
    ];

    let previousInteractionId: string | undefined = undefined;
    let nextInput: unknown = initialInput;
    let outcome: Outcome = "timed_out";
    let summary = "Ran out of steps.";

    for (let step = 1; step <= maxSteps; step++) {
      if (isAborted(signal)) {
        outcome = "abandoned";
        summary = "Run aborted by user.";
        break;
      }
      onEvent({ type: "step_start", persona: persona.id, step });

      let interaction;
      try {
        const params: Record<string, unknown> = {
          model: MODEL_ID,
          input: nextInput,
          system_instruction: persona.systemPrompt,
          tools: PERSONA_TOOLS,
        };
        if (previousInteractionId) params.previous_interaction_id = previousInteractionId;
        const { interaction: i } = await createInteractionWithFallback(
          params as unknown as Parameters<typeof createInteractionWithFallback>[0],
        );
        interaction = i;
      } catch (e) {
        onEvent({ type: "error", persona: persona.id, message: `Model error: ${(e as Error).message}` });
        outcome = "abandoned";
        summary = "Model error.";
        break;
      }

      if (isAborted(signal)) {
        outcome = "abandoned";
        summary = "Run aborted by user.";
        break;
      }

      const intAny = interaction as unknown as {
        id?: string;
        steps?: AnyStep[];
        output_text?: string;
        status?: string;
      };
      previousInteractionId = intAny.id ?? previousInteractionId;

      const monologue = pickMonologue(intAny.steps ?? [], intAny.output_text);
      if (monologue) onEvent({ type: "monologue", persona: persona.id, step, text: monologue });

      const call = pickFunctionCall(intAny.steps ?? []);
      if (!call) {
        if (intAny.status === "completed") {
          outcome = outcome === "timed_out" ? "completed" : outcome;
          summary = monologue || summary;
          break;
        }
        nextInput = [
          {
            type: "user_input" as const,
            content: [
              {
                type: "text" as const,
                text: "You must call exactly one tool now. If you're done, call complete_goal or abandon.",
              },
            ],
          },
        ];
        continue;
      }

      const args = call.arguments ?? {};
      const responseForModel: Record<string, unknown> = {};
      let actionSummary = `${call.name}(${JSON.stringify(args)})`;
      let actionOk = true;
      let extraImage: { data: string; mime: "image/png" | "image/jpeg" } | null = null;

      switch (call.name) {
        case "observe": {
          const obs = await tool_observe(session);
          onEvent({
            type: "screenshot",
            persona: persona.id,
            step,
            dataUrl: `data:${obs.screenshotMime};base64,${obs.screenshot}`,
            pageUrl: obs.url,
            pageTitle: obs.title,
          });
          responseForModel.url = obs.url;
          responseForModel.title = obs.title;
          responseForModel.outline = obs.outline;
          actionSummary = `observe → ${obs.nodes.length} nodes`;
          extraImage = { data: obs.screenshot, mime: obs.screenshotMime };
          break;
        }
        case "click": {
          const idx = Number(args.index);
          const r = await tool_click(session, idx);
          actionOk = r.ok;
          if (r.ok) {
            responseForModel.ok = true;
            responseForModel.clicked = r.clicked;
            actionSummary = `click [${idx}] "${r.clicked}"`;
            const obs = await tool_observe(session);
            onEvent({
              type: "screenshot",
              persona: persona.id,
              step,
              dataUrl: `data:${obs.screenshotMime};base64,${obs.screenshot}`,
              pageUrl: obs.url,
              pageTitle: obs.title,
            });
            responseForModel.url = obs.url;
            responseForModel.title = obs.title;
            responseForModel.outline = obs.outline;
            extraImage = { data: obs.screenshot, mime: obs.screenshotMime };
          } else {
            responseForModel.ok = false;
            responseForModel.error = r.error;
            actionSummary = `click [${idx}] failed: ${r.error}`;
          }
          break;
        }
        case "type": {
          const idx = Number(args.index);
          const text = String(args.text ?? "");
          const r = await tool_type(session, idx, text);
          actionOk = r.ok;
          if (r.ok) {
            responseForModel.ok = true;
            actionSummary = `type [${idx}] ← "${text.slice(0, 30)}"`;
          } else {
            responseForModel.ok = false;
            responseForModel.error = r.error;
            actionSummary = `type [${idx}] failed: ${r.error}`;
          }
          break;
        }
        case "scroll": {
          const dir = (args.direction as "up" | "down") ?? "down";
          await tool_scroll(session, dir);
          responseForModel.ok = true;
          actionSummary = `scroll ${dir}`;
          break;
        }
        case "report_friction": {
          const friction: FrictionLog = {
            persona: persona.id,
            severity: (args.severity as FrictionLog["severity"]) ?? "medium",
            description: String(args.description ?? ""),
            location: String(args.location ?? ""),
            step,
          };
          frictions.push(friction);
          onEvent({
            type: "friction",
            persona: persona.id,
            step,
            severity: friction.severity,
            description: friction.description,
            location: friction.location,
          });
          responseForModel.ok = true;
          responseForModel.logged = friction.description;
          actionSummary = `friction ${friction.severity}: ${friction.description.slice(0, 60)}`;
          break;
        }
        case "complete_goal": {
          summary = String(args.summary ?? "Goal completed.");
          outcome = "completed";
          actionSummary = `complete_goal: ${summary.slice(0, 80)}`;
          onEvent({ type: "action", persona: persona.id, step, tool: call.name, args, ok: true, summary: actionSummary });
          onEvent({ type: "persona_end", persona: persona.id, outcome, summary });
          return { persona: persona.id, outcome, summary, frictions, steps: step };
        }
        case "abandon": {
          summary = String(args.reason ?? "Abandoned.");
          outcome = "abandoned";
          actionSummary = `abandon: ${summary.slice(0, 80)}`;
          onEvent({ type: "action", persona: persona.id, step, tool: call.name, args, ok: true, summary: actionSummary });
          onEvent({ type: "persona_end", persona: persona.id, outcome, summary });
          return { persona: persona.id, outcome, summary, frictions, steps: step };
        }
        default: {
          actionOk = false;
          responseForModel.ok = false;
          responseForModel.error = `Unknown tool ${call.name}`;
          actionSummary = `unknown tool ${call.name}`;
        }
      }

      onEvent({
        type: "action",
        persona: persona.id,
        step,
        tool: call.name,
        args,
        ok: actionOk,
        summary: actionSummary,
      });

      let result: unknown;
      if (extraImage) {
        result = [
          {
            type: "text" as const,
            text: JSON.stringify({
              url: responseForModel.url,
              title: responseForModel.title,
              ok: responseForModel.ok ?? true,
              clicked: responseForModel.clicked,
              outline: responseForModel.outline,
            }),
          },
          { type: "image" as const, data: extraImage.data, mime_type: extraImage.mime },
        ];
      } else {
        result = JSON.stringify(responseForModel);
      }

      nextInput = [
        {
          type: "function_result" as const,
          call_id: call.id,
          name: call.name,
          result,
          is_error: !actionOk,
        },
      ];
    }

    onEvent({ type: "persona_end", persona: persona.id, outcome, summary });
    return { persona: persona.id, outcome, summary, frictions, steps: maxSteps };
  } finally {
    // CRITICAL: always release the browser context, even on abort or throw.
    await session.close();
  }
}

function buildOpeningPrompt(goal: string, obs: ObserveResult): string {
  return [
    `You're testing this website. Your goal: ${goal}`,
    ``,
    `Initial page: ${obs.title}`,
    `URL: ${obs.url}`,
    ``,
    `Outline (numbered nodes you can click/type by index):`,
    obs.outline,
    ``,
    `A screenshot is attached. Narrate ONE in-character monologue sentence, then call your next tool.`,
  ].join("\n");
}

function pickFunctionCall(steps: AnyStep[]): FunctionCallStep | null {
  for (const s of steps) {
    if (s.type === "function_call") {
      const fc = s as unknown as FunctionCallStep;
      if (fc.name) return fc;
    }
  }
  return null;
}

function pickMonologue(steps: AnyStep[], outputText?: string): string {
  if (outputText && outputText.trim()) return outputText.trim();
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i];
    if (s.type !== "model_output") continue;
    const mo = s as unknown as ModelOutputStep;
    const text = (mo.content ?? [])
      .flatMap((c) => c.parts ?? [])
      .map((p) => p.text)
      .filter((t): t is string => !!t)
      .join(" ")
      .trim();
    if (text) return text;
  }
  return "";
}
