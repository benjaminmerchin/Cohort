# Cohort

> **AI-powered multi-persona user testing.**
> Deploy a cohort of distinct AI personas that autonomously browse your site,
> try to complete goals, and report where the experience breaks — then a
> principal agent reconciles their conflicting feedback into a prioritized,
> segment-aware report.

Built at the Google I/O hackathon. Powered by **Gemini 3.5 Flash** via the
**Managed Agents (Interactions) API**, **Playwright**, **Next.js 16**, and
**shadcn**.

## The idea

A single automated test gives you one perspective. Cohort gives you *many
simultaneous perspectives* and reconciles the conflicts between them —
surfacing tradeoffs (e.g. *"optimized for power users at the expense of
first-timers"*) that no single test reveals.

Three distinct personas run in parallel against your site:

| Persona            | What they're sensitive to                                    |
| ------------------ | ------------------------------------------------------------ |
| 👋 First-Timer     | Jargon, missing onboarding, unlabeled icons, no obvious next steps |
| ⚡ Power User      | Extra clicks, marketing noise, slow flows, missing shortcuts |
| ♿︎ Accessibility   | Unlabeled inputs, icon-only nav, ARIA gaps, low contrast      |

Each persona runs a `perceive → decide → act` loop in its own browser
context, narrating an in-character monologue and logging friction points.
The Gemini **Managed Agents** harness drives the function-calling step
protocol; we execute the tools (`observe`, `click`, `type`, `scroll`,
`report_friction`, `complete_goal`, `abandon`).

When all personas finish, a principal orchestrator agent ingests every
friction log and produces:

1. **Prioritized fix list** ranked by `# personas hurt × max severity`
2. **Conflict insights** — places personas disagreed, framed as explicit tradeoffs
3. **Segments at risk** — who you're losing if you don't fix it

## Run it

```bash
npm install
npx playwright install chromium
cp .env.local.example .env.local      # then add your Gemini API key
npm run dev
```

Open <http://localhost:3000> and either point Cohort at your own site or
click *"Try with our deliberately-broken demo site"* — a tiny e-commerce
page (`public/demo-site/`) with a silently-failing checkout button,
unlabeled icon nav, unlabeled inputs, and pretentious jargon copy.

**For demos, prefer `npm run build && npm start`** — the production server
is much lighter than the Turbopack dev server.

### Environment

```ini
GEMINI_API_KEY=...
GEMINI_API_KEY_BACKUP=...        # optional — used on rate-limit fallback
GEMINI_MODEL=gemini-3.5-flash    # falls back through 3.5/3/2.5 variants
```

### Tuning knobs (all optional)

| Var                          | Default | What it does                                  |
| ---------------------------- | ------- | --------------------------------------------- |
| `COHORT_MAX_RUNS`            | `1`     | Concurrent cohort runs per process            |
| `COHORT_MAX_STEPS`           | `8`     | Hard cap on steps per persona                 |
| `COHORT_VIEWPORT_W`          | `1024`  | Playwright viewport width                     |
| `COHORT_VIEWPORT_H`          | `640`   | Playwright viewport height                    |
| `COHORT_SCREENSHOT_QUALITY`  | `55`    | JPEG quality for streamed screenshots (1-100) |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js page (app/page.tsx)                                 │
│    URL + goal → SSE client → live persona-cam grid + report  │
└──────────────────────────────────────────────────────────────┘
                            │ EventSource
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  app/api/run/route.ts  (Node runtime, ReadableStream → SSE)  │
│  · concurrency cap   · AbortSignal pass-through              │
│  · `event: fatal` halts client auto-reconnect                │
└──────────────────────────────────────────────────────────────┘
                            │ runCohort()
                            ▼
┌─────────────────────────┐   ┌────────────────────────────────┐
│  Principal orchestrator │   │  3 × Persona agents (parallel) │
│  lib/orchestrator.ts    │◄──│  lib/agent.ts                  │
│  → reconciliation       │   │   ▸ interactions.create        │
│  → prioritized report   │   │   ▸ tools: observe/click/type/…│
└─────────────────────────┘   │   ▸ Playwright browser context │
                              └────────────────────────────────┘
                                             │
                                             ▼
                              ┌────────────────────────────────┐
                              │  lib/browser.ts + dom-strip.ts │
                              │   ▸ accessibility-tree DOM     │
                              │   ▸ JPEG screenshot per step   │
                              │   ▸ HMR-safe browser singleton │
                              └────────────────────────────────┘
```

## Built during the hackathon

All code in `src/`, `public/demo-site/`, and the project config was written
during the event. Specifically:

* `src/lib/personas.ts` — distinct persona system prompts
* `src/lib/agent.ts` — perceive→decide→act loop on the Managed Agents API
* `src/lib/browser.ts` + `src/lib/dom-strip.ts` — Playwright tools + DOM compression
* `src/lib/orchestrator.ts` — principal-agent reconciliation
* `src/lib/gemini.ts` — Gemini client with model + API-key fallback
* `src/components/persona-cam.tsx` — live persona tile (screenshot + monologue + frictions)
* `src/components/report-view.tsx` — final reconciled report
* `src/app/page.tsx` — main UI
* `src/app/api/run/route.ts` — SSE event stream
* `public/demo-site/` — deliberately-broken control site for guaranteed demo

## License

MIT.
