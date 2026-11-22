"use client";

import { useRef, useState } from "react";

import { TWIN_FOCUS_EVENT } from "@/lib/twin-style";

interface Tip {
  text: string;
  twin: boolean;
  x: number;
  y: number;
}

const TIP_HALF = 115;

/**
 * Tooltip layer for the server-drawn dot grid. Each dot carries its text in
 * data-tip; one of the five plotted twins also carries data-twin, and clicking
 * it asks the twin chart on the page to pick out that line.
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
    setTip({
      text: dot.getAttribute("data-tip") ?? "",
      twin: dot.hasAttribute("data-twin"),
      x: Math.min(
        Math.max(x, TIP_HALF),
        Math.max(TIP_HALF, box.width - TIP_HALF),
      ),
      y: rect.top - box.top,
    });
  }

  function pick(target: EventTarget | null) {
    const dot =
      target instanceof Element ? target.closest("[data-twin]") : null;
    const key = dot?.getAttribute("data-twin");
    if (key)
      window.dispatchEvent(new CustomEvent(TWIN_FOCUS_EVENT, { detail: key }));
  }

  return (
    <div
      ref={ref}
      className="relative"
      onPointerOver={(event) => show(event.target)}
      onPointerLeave={() => setTip(null)}
      onClick={(event) => pick(event.target)}
    >
      {children}
      {tip && (
        <div
          role="tooltip"
          className="border-ink bg-paper-raised pointer-events-none absolute z-10 w-max max-w-[230px] border px-2.5 py-1.5 text-xs shadow-[0_6px_18px_rgb(0_0_0/0.08)]"
          style={{
            left: tip.x,
            top: tip.y,
            transform: "translate(-50%, calc(-100% - 8px))",
          }}
        >
          {tip.text}
          {tip.twin && (
            <span className="text-muted mt-0.5 block">
              One of the five closest twins. Click to see its line.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
