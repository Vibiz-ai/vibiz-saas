"use client";

/**
 * VibizSelectBridge — Lovable-style click-to-select bridge.
 *
 * Mounted at chassis root, dormant by default. The parent Vibiz
 * dashboard talks to it via postMessage to enable a single-shot
 * select cycle:
 *
 *   parent →  { type: "vibiz:select:enable"  }
 *   parent →  { type: "vibiz:select:disable" }
 *
 *   bridge →  { type: "vibiz:select:ready",  payload: { v } }
 *   bridge →  { type: "vibiz:select:hover",  payload: SelectionPayload }
 *   bridge →  { type: "vibiz:select:picked", payload: SelectionPayload }
 *   bridge →  { type: "vibiz:select:cancelled" }
 *
 * Element metadata is best-effort. We walk the React fiber attached
 * to the DOM node to recover the component name and (in dev mode)
 * `_debugSource` — the file path + line number SWC stamps on JSX.
 * In a production build that field is stripped; the bridge falls
 * back to tag + classes + CSS path, which is still enough for the
 * agent to locate the element.
 *
 * The bridge is a no-op if the page is not iframed (window.parent
 * === window). Rendering it always is safe.
 */

import { useEffect, useRef, useState } from "react";

const PROTOCOL_VERSION = 1;
const MSG_PREFIX = "vibiz:select:";
const HIGHLIGHT_ID = "__vibiz-select-highlight__";

type Rect = { x: number; y: number; width: number; height: number };

export type SelectionPayload = {
  v: number;
  tag: string;
  text: string | null;
  classes: string[];
  id: string | null;
  componentName: string | null;
  source: { file: string; line: number; column?: number } | null;
  cssPath: string;
  rect: Rect;
  ancestors: Array<{ component: string | null; tag: string }>;
};

// Loose typing for React fiber internals — these aren't part of any
// public type. Walking them is the same trick React DevTools uses.
type FiberLike = {
  type?: unknown;
  return?: FiberLike | null;
  _debugOwner?: FiberLike | null;
  _debugSource?: {
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  } | null;
};

export function VibizSelectBridge() {
  const enabledRef = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const lastTargetRef = useRef<Element | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return; // not embedded — no-op

    function postToParent(type: string, payload?: unknown) {
      try {
        window.parent.postMessage({ type, payload }, "*");
      } catch {
        // best-effort
      }
    }

    function getOrCreateHighlight(): HTMLDivElement {
      let el = document.getElementById(HIGHLIGHT_ID) as HTMLDivElement | null;
      if (el) return el;
      el = document.createElement("div");
      el.id = HIGHLIGHT_ID;
      Object.assign(el.style, {
        position: "fixed",
        pointerEvents: "none",
        zIndex: "2147483646",
        outline: "2px solid rgb(99 102 241)",
        outlineOffset: "1px",
        background: "rgba(99, 102, 241, 0.08)",
        borderRadius: "2px",
        transition: "all 60ms linear",
        display: "none",
      });
      document.body.appendChild(el);
      return el;
    }

    function removeHighlight() {
      document.getElementById(HIGHLIGHT_ID)?.remove();
    }

    function moveHighlight(rect: DOMRect) {
      const el = getOrCreateHighlight();
      el.style.display = "block";
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
    }

    function getReactFiber(node: Element): FiberLike | null {
      const keys = Object.keys(node);
      const key = keys.find(
        (k) =>
          k.startsWith("__reactFiber$") ||
          k.startsWith("__reactInternalInstance$"),
      );
      if (!key) return null;
      return (node as unknown as Record<string, FiberLike>)[key] ?? null;
    }

    function fiberComponentName(fiber: FiberLike | null): string | null {
      if (!fiber) return null;
      const type = fiber.type as
        | string
        | { displayName?: string; name?: string; render?: { displayName?: string; name?: string } }
        | undefined;
      if (typeof type === "string") return null;
      if (typeof type === "function") {
        return (type as { displayName?: string; name?: string }).displayName
          ?? (type as { name?: string }).name
          ?? null;
      }
      if (type?.displayName) return type.displayName;
      if (type?.render?.displayName) return type.render.displayName;
      if (type?.render?.name) return type.render.name;
      return null;
    }

    function findOwnerWithDebugSource(fiber: FiberLike | null): FiberLike | null {
      let f: FiberLike | null = fiber;
      let guard = 0;
      while (f && guard < 50) {
        if (f._debugSource) return f;
        f = f._debugOwner ?? f.return ?? null;
        guard += 1;
      }
      return null;
    }

    function buildCssPath(el: Element, maxDepth = 6): string {
      const parts: string[] = [];
      let cur: Element | null = el;
      let depth = 0;
      while (cur && cur.nodeType === 1 && depth < maxDepth) {
        if (cur === document.body || cur === document.documentElement) break;
        let segment = cur.tagName.toLowerCase();
        if (cur.id) {
          segment += `#${cur.id}`;
          parts.unshift(segment);
          break;
        }
        const parent: Element | null = cur.parentElement;
        if (parent) {
          const sameTag = Array.from(parent.children).filter(
            (c) => c.tagName === (cur as Element).tagName,
          );
          if (sameTag.length > 1) {
            const idx = sameTag.indexOf(cur) + 1;
            segment += `:nth-of-type(${idx})`;
          }
        }
        parts.unshift(segment);
        cur = parent;
        depth += 1;
      }
      return parts.join(" > ");
    }

    function buildPayload(target: Element): SelectionPayload {
      const rect = target.getBoundingClientRect();
      const fiber = getReactFiber(target);
      const componentName = fiberComponentName(fiber);
      const dbgFiber = findOwnerWithDebugSource(fiber);
      const dbg = dbgFiber?._debugSource ?? null;

      const text = (target.textContent ?? "").trim().slice(0, 80) || null;
      const classes = (target.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter(Boolean);

      const ancestors: Array<{ component: string | null; tag: string }> = [];
      let f: FiberLike | null = fiber?.return ?? null;
      let depth = 0;
      while (f && depth < 4) {
        const tag = typeof f.type === "string" ? f.type : "";
        const comp = fiberComponentName(f);
        if (tag || comp) ancestors.push({ component: comp, tag });
        f = f.return ?? null;
        depth += 1;
      }

      return {
        v: PROTOCOL_VERSION,
        tag: target.tagName.toLowerCase(),
        text,
        classes,
        id: target.id || null,
        componentName,
        source: dbg
          ? {
              file: String(dbg.fileName ?? ""),
              line: Number(dbg.lineNumber ?? 0),
              column: dbg.columnNumber ? Number(dbg.columnNumber) : undefined,
            }
          : null,
        cssPath: buildCssPath(target),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        ancestors,
      };
    }

    function handleMouseMove(e: MouseEvent) {
      if (!enabledRef.current) return;
      const target = e.target as Element | null;
      if (!target || target === lastTargetRef.current) return;
      if (target.id === HIGHLIGHT_ID) return;
      lastTargetRef.current = target;
      moveHighlight(target.getBoundingClientRect());
      postToParent(`${MSG_PREFIX}hover`, buildPayload(target));
    }

    function handleClick(e: MouseEvent) {
      if (!enabledRef.current) return;
      const target = e.target as Element | null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      postToParent(`${MSG_PREFIX}picked`, buildPayload(target));
      // Single-shot. Parent re-enables for the next selection cycle.
      disable();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (!enabledRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        postToParent(`${MSG_PREFIX}cancelled`);
        disable();
      }
    }

    function enable() {
      if (enabledRef.current) return;
      enabledRef.current = true;
      setEnabled(true);
      document.addEventListener("mousemove", handleMouseMove, true);
      document.addEventListener("click", handleClick, true);
      document.addEventListener("keydown", handleKeyDown, true);
      document.body.style.cursor = "crosshair";
    }

    function disable() {
      if (!enabledRef.current) return;
      enabledRef.current = false;
      setEnabled(false);
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.cursor = "";
      removeHighlight();
      lastTargetRef.current = null;
    }

    function handleParentMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data !== "object") return;
      const t = (data as { type?: string }).type;
      if (typeof t !== "string" || !t.startsWith(MSG_PREFIX)) return;
      if (t === `${MSG_PREFIX}enable`) enable();
      else if (t === `${MSG_PREFIX}disable`) disable();
    }

    window.addEventListener("message", handleParentMessage);
    postToParent(`${MSG_PREFIX}ready`, { v: PROTOCOL_VERSION });

    return () => {
      window.removeEventListener("message", handleParentMessage);
      disable();
    };
  }, []);

  if (!enabled) return null;
  return (
    <div
      data-vibiz-select-banner
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 2147483647,
        background: "rgb(99 102 241)",
        color: "white",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 12,
        padding: "4px 8px",
        borderRadius: 6,
        pointerEvents: "none",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }}
    >
      Select mode — click an element, Esc to cancel
    </div>
  );
}
