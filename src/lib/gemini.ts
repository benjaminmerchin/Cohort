import { GoogleGenAI, type FunctionDeclaration } from "@google/genai";

export const MODEL_ID = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";
export const MODEL_FALLBACKS = (
  process.env.GEMINI_MODEL_FALLBACKS ??
  "gemini-3.5-flash,gemini-3-5-flash,gemini-3-flash,gemini-3-pro-preview,gemini-2.5-flash,gemini-2.5-pro"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

function getApiKeys(): string[] {
  const keys = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_GENAI_API_KEY,
    process.env.GEMINI_API_KEY_BACKUP,
  ].filter((k): k is string => !!k && k.length > 0);
  return [...new Set(keys)];
}

const _clients = new Map<string, GoogleGenAI>();
function clientFor(apiKey: string): GoogleGenAI {
  let c = _clients.get(apiKey);
  if (!c) {
    c = new GoogleGenAI({ apiKey });
    _clients.set(apiKey, c);
  }
  return c;
}

export function getClient(): GoogleGenAI {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error(
      "Missing GEMINI_API_KEY (or GOOGLE_API_KEY / GOOGLE_GENAI_API_KEY) environment variable.",
    );
  }
  return clientFor(keys[0]);
}

// ---------------------------------------------------------------------------
// Persona tool declarations. The Managed Agents Interactions API expects
// Tool_2 = Function_2 = { type: 'function', name, description, parameters }.
// ---------------------------------------------------------------------------

export interface PersonaFunctionTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const PERSONA_TOOLS: PersonaFunctionTool[] = [
  {
    type: "function",
    name: "observe",
    description:
      "Refresh your view of the current page. Returns a numbered outline of interactive elements and the latest screenshot.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "click",
    description:
      "Click the element with the given [index] from the most recent observe() outline.",
    parameters: {
      type: "object",
      properties: {
        index: { type: "integer", description: "Numeric index from the outline." },
      },
      required: ["index"],
    },
  },
  {
    type: "function",
    name: "type",
    description: "Type text into the input/textarea with the given index.",
    parameters: {
      type: "object",
      properties: {
        index: { type: "integer" },
        text: { type: "string" },
      },
      required: ["index", "text"],
    },
  },
  {
    type: "function",
    name: "scroll",
    description: "Scroll the page up or down by one viewport.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down"] },
      },
      required: ["direction"],
    },
  },
  {
    type: "function",
    name: "report_friction",
    description:
      "Log a friction point — anything that confused, slowed, or blocked YOU specifically as this persona.",
    parameters: {
      type: "object",
      properties: {
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        description: { type: "string", description: "What was wrong, in 1–2 sentences." },
        location: { type: "string", description: "Where on the page (e.g. 'top nav', 'checkout form', 'hero CTA')." },
      },
      required: ["severity", "description", "location"],
    },
  },
  {
    type: "function",
    name: "complete_goal",
    description: "You achieved (or essentially achieved) your goal. End the session positively.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One-sentence summary of what you accomplished." },
      },
      required: ["summary"],
    },
  },
  {
    type: "function",
    name: "abandon",
    description: "You give up. End the session and explain why.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why you're giving up, in character." },
      },
      required: ["reason"],
    },
  },
];

// Legacy alias kept for any old import sites.
export const PERSONA_TOOL_DECLARATIONS: FunctionDeclaration[] = PERSONA_TOOLS.map(
  (t) => ({
    name: t.name,
    description: t.description,
    parametersJsonSchema: t.parameters,
  }),
);

// Schema used by the reconciliation step to force structured JSON output.
export const RECONCILIATION_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description: "A punchy 1-sentence headline summarizing what this site is losing if no fixes are made.",
    },
    prioritizedFixes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rank: { type: "integer" },
          title: { type: "string", description: "Short imperative title, e.g. 'Add labels to checkout inputs'." },
          description: { type: "string", description: "What to fix and why." },
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          affectedPersonas: {
            type: "array",
            items: { type: "string", enum: ["first_timer", "power_user", "accessibility"] },
          },
          losing: { type: "string", description: "Who you're losing if you don't fix this (in segment terms)." },
        },
        required: ["rank", "title", "description", "severity", "affectedPersonas", "losing"],
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "A tradeoff personas disagreed on." },
          description: { type: "string", description: "Frame the tradeoff explicitly." },
          perPersona: {
            type: "object",
            description: "Keyed by persona id — what each said.",
            additionalProperties: { type: "string" },
          },
        },
        required: ["title", "description", "perPersona"],
      },
    },
    segmentsAtRisk: {
      type: "array",
      items: {
        type: "object",
        properties: {
          persona: { type: "string", enum: ["first_timer", "power_user", "accessibility"] },
          risk: { type: "string", description: "Why this segment is at risk of abandoning." },
        },
        required: ["persona", "risk"],
      },
    },
  },
  required: ["headline", "prioritizedFixes", "conflicts", "segmentsAtRisk"],
};

// ---------------------------------------------------------------------------
// Managed Agents (Interactions) API helpers — this is the harness layer.
// ---------------------------------------------------------------------------

/**
 * Wrap `client.interactions.create` with model-id + api-key fallback. Returns
 * the Interaction object plus the model id that succeeded.
 */
export async function createInteractionWithFallback(
  params: Parameters<GoogleGenAI["interactions"]["create"]>[0],
): Promise<{
  interaction: Awaited<ReturnType<GoogleGenAI["interactions"]["create"]>>;
  modelUsed: string;
}> {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error("No Gemini API key configured.");

  // params may be a model-interaction (has `model`) or an agent-interaction
  // (has `agent`). For agent-interactions we don't substitute models.
  const isModelInteraction = "model" in params && params.model;
  const baseModel = isModelInteraction ? (params as { model: string }).model : null;
  const candidates = baseModel
    ? [baseModel, ...MODEL_FALLBACKS].filter((m, i, a) => m && a.indexOf(m) === i)
    : [null as unknown as string];

  const triedModels: string[] = [];
  let lastErr: unknown = null;

  for (const model of candidates) {
    for (const apiKey of keys) {
      try {
        const callParams = isModelInteraction
          ? { ...(params as unknown as Record<string, unknown>), model }
          : params;
        const interaction = await clientFor(apiKey).interactions.create(
          callParams as Parameters<GoogleGenAI["interactions"]["create"]>[0],
        );
        return { interaction, modelUsed: model ?? "agent" };
      } catch (e) {
        const msg = (e as Error).message || "";
        lastErr = e;
        if (/quota|rate|429|resource_exhausted/i.test(msg)) continue; // try next key
        if (/not.*found|unsupported|invalid|404|400/i.test(msg)) {
          triedModels.push(model ?? "(agent)");
          break; // try next model
        }
        throw e;
      }
    }
  }
  throw new Error(
    `Gemini interaction failed for models [${triedModels.join(", ")}] across ${keys.length} key(s): ${(lastErr as Error)?.message}`,
  );
}
