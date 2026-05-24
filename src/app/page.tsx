import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Eye,
  Flame,
  GitBranch,
  Layers,
  Play,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PERSONA_ORDER, PERSONAS } from "@/lib/personas";
import { cn } from "@/lib/utils";

const HOW_IT_WORKS = [
  {
    icon: Eye,
    title: "Point at a URL",
    body:
      "Drop in any site — staging, production, even a local dev server. Pick a goal: 'buy a t-shirt', 'finish onboarding', 'find pricing'.",
  },
  {
    icon: Users,
    title: "A cohort runs in parallel",
    body:
      "Three distinct AI personas open their own browser context and try to achieve the goal — each narrating in character as they get stuck, confused, or frustrated.",
  },
  {
    icon: Flame,
    title: "One reconciled report",
    body:
      "A principal agent ingests every persona's friction log and emits a single prioritized fix list, explicit tradeoffs where personas disagreed, and the segments at risk of abandoning.",
  },
];

const FEATURES = [
  {
    icon: Layers,
    title: "Built on Gemini Managed Agents",
    body:
      "Each persona is its own managed-agent interaction. The harness keeps state server-side via previous_interaction_id — we just feed back function_result steps as the personas act.",
  },
  {
    icon: Wrench,
    title: "Wired into Claude Code",
    body:
      "Point Cohort at a local repo path and the report turns into a one-click 'Apply with Claude Code' for any fix you want. Claude Code edits the source in place, you review the diff.",
  },
  {
    icon: ShieldCheck,
    title: "Honest about tradeoffs",
    body:
      "The reconciler surfaces conflicts where personas disagreed — 'Power User loved the dense layout, First-Timer was lost' — so you decide which segment to optimize for.",
  },
];

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-black text-white">
      {/* Top nav */}
      <header className="sticky top-0 z-30 w-full border-b border-white/5 bg-black/90">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-lg border border-white/15 bg-white/[0.04]">
              <Bot className="size-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold tracking-[0.18em] text-white">COHORT</span>
            <Badge variant="outline" className="ml-2 hidden md:inline-flex">
              Google I/O hackathon · 2026
            </Badge>
          </div>
          <nav className="hidden items-center gap-7 text-sm text-white/65 md:flex">
            <a href="#how" className="transition hover:text-white">
              How it works
            </a>
            <a href="#personas" className="transition hover:text-white">
              Personas
            </a>
            <a href="#stack" className="transition hover:text-white">
              Stack
            </a>
            <a
              href="https://github.com/benjaminmerchin/Cohort"
              className="inline-flex items-center gap-1.5 transition hover:text-white"
            >
              <GitBranch className="size-3.5" />
              GitHub
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden sm:inline-flex",
              )}
            >
              Sign in
            </Link>
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ size: "sm" }),
                "rounded-full px-4",
              )}
            >
              Get started
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/3 size-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.05] blur-3xl" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-4xl px-6 py-20 md:py-28">
          <div className="mb-6 flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-medium text-white/70">
              <span className="relative inline-flex size-1.5 rounded-full bg-white" />
              ON AIR · 3 personas standing by
            </div>
          </div>

          <h1 className="text-balance text-center text-5xl font-semibold leading-[1.02] tracking-[-0.03em] md:text-7xl">
            Your site, through a{" "}
            <span className="font-serif italic font-normal">cohort</span> of users.
          </h1>

          <p className="mx-auto mt-7 max-w-2xl text-balance text-center text-lg text-white/60 md:text-xl">
            Cohort deploys distinct AI personas that autonomously browse your site,
            try to complete goals, and report where the experience breaks — then
            reconciles their conflicting feedback into a prioritized, segment-aware report.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 rounded-full px-7 text-sm font-medium",
              )}
            >
              <Play className="size-4 fill-current" />
              Deploy a cohort
            </Link>
            <a
              href="#how"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 rounded-full px-7 text-sm font-medium",
              )}
            >
              How it works
              <ArrowRight className="size-3.5" />
            </a>
          </div>

          <p className="mt-12 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">
            Powered by Gemini 3.5 · Managed Agents · Playwright · Claude Code
          </p>
        </div>
      </section>

      {/* The problem */}
      <section className="relative border-y border-white/5 py-20">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 md:grid-cols-[0.85fr_1.15fr] md:items-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
              The problem
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] md:text-4xl">
              One automated test gives you{" "}
              <span className="font-serif italic font-normal">one</span> perspective.
            </h2>
          </div>
          <div className="space-y-4 text-white/65 md:text-lg">
            <p>
              A site can score perfectly for power users while silently bleeding
              first-timers, and be unusable on a screen reader the whole time.
              Traditional automated testing — and most &ldquo;AI agent&rdquo; demos —
              never see those tradeoffs.
            </p>
            <p>
              Cohort makes the tradeoffs visible by running many simultaneous
              perspectives and reconciling the conflicts between them.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative mx-auto w-full max-w-6xl px-6 py-24">
        <div className="mb-12">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            How it works
          </p>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
            From a single URL to a{" "}
            <span className="font-serif italic font-normal">prioritized</span> fix list.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className="group relative h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-7 transition hover:border-white/20 hover:bg-white/[0.04]"
            >
              <div className="mb-6 flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/[0.04]">
                  <Icon className="size-5 text-white" />
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                  Step 0{i + 1}
                </span>
              </div>
              <h3 className="text-xl font-semibold tracking-tight text-white">{title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-white/60">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Personas */}
      <section id="personas" className="relative isolate border-y border-white/5 bg-gradient-to-b from-transparent via-white/[0.015] to-transparent py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="mb-12 max-w-2xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
              Meet the cohort
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
              Three personalities. Three blind spots they{" "}
              <span className="font-serif italic font-normal">refuse</span> to share.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {PERSONA_ORDER.map((pid) => {
              const p = PERSONAS[pid];
              return (
                <div
                  key={pid}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-6"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div
                      className={cn(
                        "grid size-11 place-items-center rounded-xl border border-white/15 bg-gradient-to-br text-xl",
                        p.accent,
                      )}
                    >
                      {p.emoji}
                    </div>
                    <div>
                      <div className="text-base font-semibold text-white">{p.name}</div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                        {p.id}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-white/60">{p.oneLine}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* The differentiator */}
      <section className="relative mx-auto w-full max-w-6xl px-6 py-24">
        <div className="mb-12 grid gap-10 md:grid-cols-[1fr_1fr] md:items-end">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
              The differentiator
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
              A principal agent that reconciles the{" "}
              <span className="font-serif italic font-normal">disagreements</span>.
            </h2>
          </div>
          <p className="text-white/65 md:text-lg">
            When the personas finish, a fourth managed agent ingests every
            friction log and emits a single structured report: ranked fixes,
            explicit tradeoffs, and the segments you&apos;re losing if you
            don&apos;t ship.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-white/10 bg-white/[0.02] p-7"
            >
              <div className="mb-5 grid size-11 place-items-center rounded-xl border border-white/15 bg-white/[0.04]">
                <Icon className="size-5 text-white" />
              </div>
              <h3 className="text-lg font-semibold tracking-tight text-white">{title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-white/60">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stack */}
      <section id="stack" className="relative border-y border-white/5 py-20">
        <div className="mx-auto w-full max-w-5xl px-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            The stack
          </p>
          <h2 className="mt-3 max-w-2xl text-balance text-3xl font-semibold tracking-[-0.02em] md:text-4xl">
            Boring infra. <span className="font-serif italic font-normal">Interesting</span> agents.
          </h2>

          <ul className="mt-10 grid gap-4 md:grid-cols-2">
            {[
              { label: "Agent layer", value: "Gemini 3.5 Flash · Managed Agents (Interactions API)" },
              { label: "Browser automation", value: "Playwright · Chromium · one isolated context per persona" },
              { label: "App", value: "Next.js 16 App Router · server components · SSE" },
              { label: "UI", value: "Tailwind · shadcn primitives · dark by default" },
              { label: "Fix flow", value: "Claude Code in headless mode, scoped to your local repo" },
              { label: "Auth (demo)", value: "Dummy localStorage — swap for Better Auth + Supabase later" },
            ].map((row) => (
              <li
                key={row.label}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300/80" />
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
                    {row.label}
                  </div>
                  <div className="mt-0.5 text-sm text-white/80">{row.value}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative mx-auto w-full max-w-6xl px-6 pb-24 pt-20">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-12 text-center md:p-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 top-1/2 size-80 -translate-y-1/2 rounded-full bg-white/5 blur-3xl" />
            <div className="absolute -right-20 top-1/2 size-80 -translate-y-1/2 rounded-full bg-white/5 blur-3xl" />
          </div>
          <h2 className="relative text-balance text-3xl font-semibold tracking-[-0.02em] md:text-5xl">
            Stop shipping for{" "}
            <span className="font-serif italic font-normal">one</span> user.
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-balance text-white/65 md:text-lg">
            Run your first cohort in under a minute. There&apos;s a deliberately-broken
            demo site baked in if you don&apos;t have something to test yet.
          </p>
          <div className="relative mt-10 flex justify-center">
            <Link
              href="/sign-in"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 rounded-full px-7 text-sm font-medium",
              )}
            >
              Deploy a cohort
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-3 px-6 py-8 text-[11px] text-white/40 md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <div className="grid size-5 place-items-center rounded-md border border-white/15 bg-white/[0.04]">
              <Bot className="size-3 text-white" />
            </div>
            <span className="font-mono uppercase tracking-[0.18em]">Cohort · CH 00 · MAIN</span>
          </div>
          <span>Built at the Google I/O hackathon · 2026</span>
        </div>
      </footer>
    </div>
  );
}
