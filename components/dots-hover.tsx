"use client";

import { useRef, useState } from "react";

import { TWIN_FOCUS_EVENT } from "@/lib/twin-style";

interface Tip {
  text: string;
  twin: boolean;
  x: number;
  y: number;
  /** Shown under the dot instead of above it, so it does not cover the headline. */
  below: boolean;
}

const TIP_HALF = 115;
/** Roughly the tallest tooltip; dots nearer the top than this get it below. */
const TIP_ROOM = 96;

/**
 * Tooltip and keyboard layer for the server-drawn dot grid. Each dot carries
 * its text in data-tip; one of the five plotted twins also carries data-twin,
 * and clicking it (or Enter on it) asks the twin chart on the page to pick out
 * that line. The grid is one tab stop; the arrow keys move between dots.
 */
export function DotsHover({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  function show(target: EventTarget | null) {
    const box = ref.current?.getBoundingClientRect();
    const dot = target instanceof Element ? target.closest("[data-tip]") : null;
    if (!dot || !box) {
      setTip(null);
      return;
    }
    const rect = dot.getBoundingClientRect();
    const x = rect.left + rect.width / 2 - box.left;
    const top = rect.top - box.top;
    // The first row sits right under the big number, and a dot near the top
    // of the screen has no room above it either.
    const below = top < rect.height || rect.top < TIP_ROOM;
    setTip({
      text: dot.getAttribute("data-tip") ?? "",
      twin: dot.hasAttribute("data-twin"),
      x: Math.min(
        Math.max(x, TIP_HALF),
        Math.max(TIP_HALF, box.width - TIP_HALF),
      ),
      y: below ? rect.bottom - box.top : top,
      below,
    });
  }

  function pick(target: EventTarget | null) {
    const dot =
      target instanceof Element ? target.closest("[data-twin]") : null;
    const key = dot?.getAttribute("data-twin");
    if (key)
      window.dispatchEvent(new CustomEvent(TWIN_FOCUS_EVENT, { detail: key }));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const dots = Array.from(
      ref.current?.querySelectorAll<SVGGElement>("[data-tip]") ?? [],
    );
    const current = dots.indexOf(event.target as SVGGElement);
    if (current < 0) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      pick(event.target);
      return;
    }
    if (event.key === "Escape") {
      setTip(null);
      return;
    }
    const cols = Number(
      ref.current?.querySelector("[data-cols]")?.getAttribute("data-cols") ?? 1,
    );
    const moves: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      ArrowDown: current + cols,
      ArrowUp: current - cols,
      Home: 0,
      End: dots.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const index = Math.min(Math.max(next, 0), dots.length - 1);
    if (index === current) return;
    dots[current].setAttribute("tabindex", "-1");
    dots[index].setAttribute("tabindex", "0");
    dots[index].focus();
  }

  return (
    <div
      ref={ref}
      className="relative"
      onPointerOver={(event) => show(event.target)}
      onPointerLeave={() => setTip(null)}
      onFocus={(event) => show(event.target)}
      onBlur={() => setTip(null)}
      onKeyDown={onKeyDown}
      onClick={(event) => pick(event.target)}
    >
      {children}
      {tip && (
        <div
          // The dot itself already carries this text for screen readers.
          aria-hidden
          className="border-ink bg-paper-raised pointer-events-none absolute z-10 w-max max-w-[230px] border px-2.5 py-1.5 text-xs shadow-[0_6px_18px_rgb(0_0_0/0.08)]"
          style={{
            left: tip.x,
            top: tip.y,
            transform: tip.below
              ? "translate(-50%, 8px)"
              : "translate(-50%, calc(-100% - 8px))",
          }}
        >
          {tip.text}
          {tip.twin && (
            <span className="text-muted mt-0.5 block">
              One of the five closest twins. Click or press Enter to see its
              line.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
