//! Dev-only browser runtime, injected into the page by the Vite plugin.
//! Self-contained: it is serialized with `Function.prototype.toString`,
//! so it must not reference anything outside its own body.

export interface ReactSourceMatch {
  /** `src/pages/Checkout.tsx:42` */
  source: string;
  /** Lowercase tag name of the DOM element. */
  tag: string;
  /** Visible text, trimmed and shortened. */
  text: string;
}

export interface ReactSourceApi {
  /** `path:line` of the JSX that rendered the element (or its nearest tagged ancestor). */
  of(target: Element | string): string | null;
  /** Distinct `path:line` values from the element up to the root: where it is rendered, then where its parents are. */
  stack(target: Element | string): string[];
  /** Elements whose visible text contains `text` (case-insensitive), innermost first. */
  find(text: string): ReactSourceMatch[];
  /** The prompt-ready text that Alt+click copies. */
  describe(target: Element | string): string | null;
}

declare global {
  interface Window {
    __REACT_SOURCE__?: ReactSourceApi;
  }
}

export function installReactSourceClient(attr: string): void {
  if (typeof window === "undefined" || window.__REACT_SOURCE__) return;

  const selector = `[${attr}]`;
  const resolve = (target: Element | string): Element | null =>
    typeof target === "string" ? document.querySelector(target) : target;
  const tagged = (target: Element | string): Element | null => resolve(target)?.closest(selector) ?? null;
  const textOf = (el: Element): string => {
    const text = ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  };

  const stack = (target: Element | string): string[] => {
    const out: string[] = [];
    for (let el = tagged(target); el; el = el.parentElement?.closest(selector) ?? null) {
      const source = el.getAttribute(attr);
      if (source && !out.includes(source)) out.push(source);
    }
    return out;
  };

  const describe = (target: Element | string): string | null => {
    const el = tagged(target);
    if (!el) return null;
    const [source, ...parents] = stack(el);
    const text = textOf(el);
    const lines = [`${source} <${el.tagName.toLowerCase()}>${text ? ` "${text}"` : ""}`];
    if (parents.length) lines.push(`inside: ${parents.slice(0, 4).join(" ← ")}`);
    return lines.join("\n");
  };

  const api: ReactSourceApi = {
    of: (target) => tagged(target)?.getAttribute(attr) ?? null,
    stack,
    describe,
    find(text) {
      const needle = text.toLowerCase();
      const matches = [...document.querySelectorAll(selector)].filter((el) =>
        textOf(el).toLowerCase().includes(needle)
      );
      // Innermost first: drop elements that contain another match.
      return matches
        .filter((el) => !matches.some((other) => other !== el && el.contains(other)))
        .map((el) => ({ source: el.getAttribute(attr) ?? "", tag: el.tagName.toLowerCase(), text: textOf(el) }));
    },
  };
  window.__REACT_SOURCE__ = api;

  // Alt (Option) + hover highlights, Alt + click copies a prompt-ready reference.
  const box = document.createElement("div");
  const label = document.createElement("div");
  box.setAttribute("aria-hidden", "true");
  box.style.cssText =
    "position:fixed;z-index:2147483647;pointer-events:none;display:none;border:2px solid #7c3aed;" +
    "background:rgba(124,58,237,.08);border-radius:3px;transition:all 40ms";
  label.style.cssText =
    "position:absolute;left:-2px;bottom:100%;margin-bottom:2px;padding:2px 6px;border-radius:3px;" +
    "background:#7c3aed;color:#fff;font:12px/1.4 ui-monospace,Menlo,monospace;white-space:nowrap";
  box.appendChild(label);

  let current: Element | null = null;
  const hide = () => {
    box.style.display = "none";
    current = null;
  };
  const show = (el: Element) => {
    if (!box.isConnected) document.body.appendChild(box);
    const rect = el.getBoundingClientRect();
    Object.assign(box.style, {
      display: "block",
      left: `${rect.left - 2}px`,
      top: `${rect.top - 2}px`,
      width: `${rect.width + 4}px`,
      height: `${rect.height + 4}px`,
    });
    label.textContent = el.getAttribute(attr);
    label.style.bottom = rect.top < 24 ? "auto" : "100%";
    label.style.top = rect.top < 24 ? "100%" : "auto";
    current = el;
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  };

  const toast = (message: string) => {
    const note = document.createElement("div");
    note.setAttribute("role", "status");
    note.textContent = message;
    note.style.cssText =
      "position:fixed;z-index:2147483647;left:50%;bottom:24px;transform:translateX(-50%);padding:6px 12px;" +
      "border-radius:6px;background:#111;color:#fff;font:13px/1.4 ui-monospace,Menlo,monospace;pointer-events:none";
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 1600);
  };

  const fromEvent = (event: MouseEvent) =>
    event.target instanceof Element ? event.target.closest(selector) : null;

  document.addEventListener(
    "mousemove",
    (event) => {
      if (!event.altKey) return hide();
      const el = fromEvent(event);
      if (el) show(el);
      else hide();
    },
    true
  );
  // Swallow the whole Alt+click so it neither selects text, nor follows or downloads a link.
  for (const type of ["mousedown", "mouseup", "click"] as const) {
    document.addEventListener(
      type,
      (event) => {
        if (!event.altKey || !fromEvent(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (type !== "click") return;
        const text = describe(event.target as Element);
        if (!text) return;
        void copy(text).then(() => toast(`Copied ${text.split("\n")[0].split(" ")[0]}`));
      },
      true
    );
  }
  document.addEventListener("keyup", (event) => {
    if (event.key === "Alt") hide();
  });
  window.addEventListener("blur", hide);
  window.addEventListener("scroll", () => current && show(current), true);
}
