/**
 * Strip a live page DOM down to an indexed list of interactive + textual elements.
 * Runs inside the browser via page.evaluate. Returns a compact representation
 * the LLM can reason about, plus a `nodes` map so we can resolve an index back
 * to a real selector when the agent decides to act.
 */

export interface StrippedNode {
  /** stable index the agent uses to refer to this node */
  i: number;
  /** kind of element */
  kind: "link" | "button" | "input" | "select" | "textarea" | "heading" | "text" | "image" | "landmark";
  /** visible / accessible name */
  text: string;
  /** optional input type / role / aria info */
  tag?: string;
  role?: string;
  type?: string;
  placeholder?: string;
  name?: string;
  href?: string;
  ariaLabel?: string;
  /** css selector path the runtime uses to find this element again */
  selector: string;
  /** for screen-reader-style flags */
  hasAccessibleName?: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  nodes: StrippedNode[];
  /** condensed text form of the page, in reading order, for the LLM */
  outline: string;
}

/** Runs inside the browser. Must be a single self-contained function. */
export function stripDomInBrowser(): {
  url: string;
  title: string;
  nodes: StrippedNode[];
} {
  function isVisible(el: Element): boolean {
    const r = (el as HTMLElement).getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = window.getComputedStyle(el as HTMLElement);
    if (s.display === "none" || s.visibility === "hidden" || s.opacity === "0") return false;
    return true;
  }

  function cssPath(el: Element): string {
    if (!(el instanceof Element)) return "";
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      let part = node.nodeName.toLowerCase();
      if ((node as HTMLElement).id) {
        part += `#${(node as HTMLElement).id}`;
        parts.unshift(part);
        break;
      } else {
        let sib = node;
        let nth = 1;
        while ((sib = sib.previousElementSibling as Element)) {
          if (sib.nodeName === node.nodeName) nth++;
        }
        part += `:nth-of-type(${nth})`;
      }
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function clean(s: string | null | undefined): string {
    return (s ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
  }

  function accessibleName(el: Element): string {
    const aria = clean(el.getAttribute("aria-label"));
    if (aria) return aria;
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const lbl = labelledby.split(" ").map((id) => document.getElementById(id)?.textContent || "").join(" ");
      if (clean(lbl)) return clean(lbl);
    }
    if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
      const id = (el as HTMLInputElement).id;
      if (id) {
        const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (lbl) return clean(lbl.textContent);
      }
      const wrappingLabel = el.closest("label");
      if (wrappingLabel) return clean(wrappingLabel.textContent);
    }
    const title = clean(el.getAttribute("title"));
    if (title) return title;
    const text = clean((el as HTMLElement).innerText || el.textContent || "");
    return text;
  }

  const nodes: StrippedNode[] = [];
  let i = 0;
  const selector = "a, button, input, select, textarea, [role=button], [role=link], h1, h2, h3, h4, [role=main], [role=navigation], [role=banner], [role=contentinfo], img[alt]";
  const seen = new Set<Element>();
  document.querySelectorAll(selector).forEach((el) => {
    if (seen.has(el) || !isVisible(el)) return;
    seen.add(el);
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || undefined;
    const name = accessibleName(el);
    let kind: StrippedNode["kind"] = "text";
    if (tag === "a" || role === "link") kind = "link";
    else if (tag === "button" || role === "button") kind = "button";
    else if (tag === "input") kind = "input";
    else if (tag === "select") kind = "select";
    else if (tag === "textarea") kind = "textarea";
    else if (/^h[1-4]$/.test(tag)) kind = "heading";
    else if (tag === "img") kind = "image";
    else if (role && ["main", "navigation", "banner", "contentinfo"].includes(role)) kind = "landmark";

    const node: StrippedNode = {
      i: i++,
      kind,
      text: name,
      tag,
      role,
      type: (el as HTMLInputElement).type || undefined,
      placeholder: clean((el as HTMLInputElement).placeholder),
      name: (el as HTMLInputElement).name || undefined,
      href: (el as HTMLAnchorElement).href || undefined,
      ariaLabel: clean(el.getAttribute("aria-label")) || undefined,
      selector: cssPath(el),
      hasAccessibleName: !!name,
    };
    nodes.push(node);
  });
  return { url: location.href, title: document.title, nodes };
}

/** Render a token-frugal outline the LLM sees. */
export function renderOutline(nodes: StrippedNode[]): string {
  const lines: string[] = [];
  for (const n of nodes) {
    const txt = n.text || `(${n.placeholder ? `placeholder=${n.placeholder}` : "no accessible name"})`;
    switch (n.kind) {
      case "heading":
        lines.push(`[${n.i}] # ${txt}`);
        break;
      case "link":
        lines.push(`[${n.i}] link "${txt}"${n.href ? ` → ${shortHref(n.href)}` : ""}`);
        break;
      case "button":
        lines.push(`[${n.i}] button "${txt}"`);
        break;
      case "input":
        lines.push(`[${n.i}] input ${n.type || "text"}${n.placeholder ? ` placeholder="${n.placeholder}"` : ""}${n.hasAccessibleName ? ` label="${n.text}"` : " (no label)"}`);
        break;
      case "select":
        lines.push(`[${n.i}] select "${txt}"`);
        break;
      case "textarea":
        lines.push(`[${n.i}] textarea "${txt}"`);
        break;
      case "image":
        lines.push(`[${n.i}] image alt="${txt}"`);
        break;
      case "landmark":
        lines.push(`[${n.i}] <${n.role}>`);
        break;
      default:
        lines.push(`[${n.i}] ${txt}`);
    }
  }
  return lines.join("\n");
}

function shortHref(href: string): string {
  try {
    const u = new URL(href);
    return u.pathname + u.search;
  } catch {
    return href.slice(0, 60);
  }
}
