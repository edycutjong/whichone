"use client";
import { useLayoutEffect, useRef } from "react";

/** FLIP: when children of `ref` change order, animate each from its old position to its new one (300 ms). */
export function useFlip(ref: React.RefObject<HTMLElement | null>, dep: unknown) {
  const last = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, DOMRect>();
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const id = child.dataset.id;
      if (!id) continue;
      const rect = child.getBoundingClientRect();
      next.set(id, rect);
      const prev = last.current.get(id);
      if (prev && !reduce) {
        const dx = prev.left - rect.left, dy = prev.top - rect.top;
        if (dx || dy) child.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 300, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    }
    last.current = next;
  }, [ref, dep]);
}
