import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { stripDomInBrowser, renderOutline, type StrippedNode, type PageSnapshot } from "./dom-strip";

// ---------------------------------------------------------------------------
// HMR-safe singleton browser. The Next.js dev server reloads modules on every
// edit; storing the launched browser on `globalThis` means HMR reuses the
// same Chromium process instead of forking a new one each reload.
// ---------------------------------------------------------------------------

type Global = typeof globalThis & {
  __cohort_browser__?: Browser;
  __cohort_active_contexts__?: Set<BrowserContext>;
  __cohort_active_runs__?: number;
  __cohort_exit_hook__?: boolean;
};
const g = globalThis as Global;
if (!g.__cohort_active_contexts__) g.__cohort_active_contexts__ = new Set();
if (typeof g.__cohort_active_runs__ !== "number") g.__cohort_active_runs__ = 0;

// Best-effort cleanup on process exit. Registered once per process.
if (!g.__cohort_exit_hook__) {
  g.__cohort_exit_hook__ = true;
  const cleanup = async () => {
    try {
      for (const ctx of g.__cohort_active_contexts__ ?? []) {
        await ctx.close().catch(() => {});
      }
      g.__cohort_active_contexts__?.clear();
      await g.__cohort_browser__?.close().catch(() => {});
      g.__cohort_browser__ = undefined;
    } catch {
      // ignore
    }
  };
  process.once("beforeExit", cleanup);
  process.once("SIGINT", async () => {
    await cleanup();
    process.exit(0);
  });
  process.once("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });
}

async function getBrowser(): Promise<Browser> {
  if (g.__cohort_browser__ && g.__cohort_browser__.isConnected()) {
    return g.__cohort_browser__;
  }
  g.__cohort_browser__ = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-renderer-backgrounding",
      "--disable-features=Translate,BackForwardCache",
      // Reduce per-process memory cap; we don't need to render heavy media.
      "--js-flags=--max-old-space-size=384",
    ],
  });
  return g.__cohort_browser__;
}

// ---------------------------------------------------------------------------
// Concurrency cap. Only N persona runs may have active contexts at once.
// A "run" is a single `runCohort` invocation (1-3 personas). We cap the
// number of concurrent COHORTS, not personas — so e.g. 1 cohort = 3 contexts.
// ---------------------------------------------------------------------------

export const MAX_CONCURRENT_RUNS = Number(process.env.COHORT_MAX_RUNS ?? 1);

export function activeRunCount(): number {
  return g.__cohort_active_runs__ ?? 0;
}

export function tryReserveRunSlot(): boolean {
  if ((g.__cohort_active_runs__ ?? 0) >= MAX_CONCURRENT_RUNS) return false;
  g.__cohort_active_runs__ = (g.__cohort_active_runs__ ?? 0) + 1;
  return true;
}

export function releaseRunSlot() {
  g.__cohort_active_runs__ = Math.max(0, (g.__cohort_active_runs__ ?? 1) - 1);
}

// ---------------------------------------------------------------------------
// Per-persona session.
// ---------------------------------------------------------------------------

export interface PersonaSession {
  context: BrowserContext;
  page: Page;
  lastSnapshot: PageSnapshot | null;
  close: () => Promise<void>;
}

const VIEWPORT_W = Number(process.env.COHORT_VIEWPORT_W ?? 1024);
const VIEWPORT_H = Number(process.env.COHORT_VIEWPORT_H ?? 640);
const SCREENSHOT_QUALITY = Number(process.env.COHORT_SCREENSHOT_QUALITY ?? 55);

export async function openSession(): Promise<PersonaSession> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    javaScriptEnabled: true,
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Cohort/1.0",
  });
  // Block heavy media so we use less memory and bandwidth.
  await context.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "media" || t === "font" || t === "websocket") return route.abort();
    return route.continue();
  });
  const page = await context.newPage();

  g.__cohort_active_contexts__?.add(context);
  let closed = false;
  const session: PersonaSession = {
    context,
    page,
    lastSnapshot: null,
    close: async () => {
      if (closed) return;
      closed = true;
      g.__cohort_active_contexts__?.delete(context);
      try {
        await context.close();
      } catch {
        // ignore
      }
    },
  };
  return session;
}

export async function shutdownBrowser() {
  try {
    for (const ctx of g.__cohort_active_contexts__ ?? []) {
      await ctx.close().catch(() => {});
    }
    g.__cohort_active_contexts__?.clear();
    await g.__cohort_browser__?.close().catch(() => {});
    g.__cohort_browser__ = undefined;
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Tool implementations — each returns a small JSON-able result.
// ---------------------------------------------------------------------------

export interface ObserveResult {
  url: string;
  title: string;
  outline: string;
  nodes: StrippedNode[];
  /** base64 JPEG */
  screenshot: string;
  screenshotMime: "image/jpeg" | "image/png";
}

export async function tool_navigate(
  s: PersonaSession,
  url: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    await s.page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await s.page.waitForLoadState("load", { timeout: 8000 }).catch(() => {});
    return { ok: true, url: s.page.url() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function tool_observe(s: PersonaSession): Promise<ObserveResult> {
  const stripped = await s.page.evaluate(stripDomInBrowser);
  const snapshot: PageSnapshot = {
    url: stripped.url,
    title: stripped.title,
    nodes: stripped.nodes as StrippedNode[],
    outline: renderOutline(stripped.nodes as StrippedNode[]),
  };
  s.lastSnapshot = snapshot;
  // JPEG is far smaller than PNG; quality ~55 is plenty for the LLM and the cam tile.
  const buf = await s.page.screenshot({ type: "jpeg", quality: SCREENSHOT_QUALITY, fullPage: false });
  return {
    url: snapshot.url,
    title: snapshot.title,
    outline: snapshot.outline,
    nodes: snapshot.nodes,
    screenshot: buf.toString("base64"),
    screenshotMime: "image/jpeg",
  };
}

function resolveNode(s: PersonaSession, index: number): StrippedNode | null {
  if (!s.lastSnapshot) return null;
  return s.lastSnapshot.nodes.find((n) => n.i === index) ?? null;
}

export async function tool_click(
  s: PersonaSession,
  index: number
): Promise<{ ok: true; clicked: string } | { ok: false; error: string }> {
  const node = resolveNode(s, index);
  if (!node) return { ok: false, error: `No element with index ${index}` };
  try {
    const loc = node.selector
      ? s.page.locator(node.selector).first()
      : s.page.getByText(node.text, { exact: false }).first();
    await loc.click({ timeout: 5000 });
    await s.page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
    return { ok: true, clicked: node.text || node.selector };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function tool_type(
  s: PersonaSession,
  index: number,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const node = resolveNode(s, index);
  if (!node) return { ok: false, error: `No element with index ${index}` };
  try {
    const loc = s.page.locator(node.selector).first();
    await loc.fill(text, { timeout: 5000 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function tool_scroll(
  s: PersonaSession,
  direction: "up" | "down"
): Promise<{ ok: true }> {
  const delta = direction === "down" ? 600 : -600;
  await s.page.evaluate((d) => window.scrollBy(0, d), delta);
  await s.page.waitForTimeout(200);
  return { ok: true };
}
