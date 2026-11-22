"use client";

import { ArrowRight } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

/**
 * Scroll box for wide tables on small screens. Shows a "swipe" hint and a soft
 * right edge while there are more columns to the right.
 */
export function ScrollX({
  label,
  className = "",
  children,
}: {
  label: string;
  /** Extra classes for the scroll box, e.g. a max height. */
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({
    wide: false,
    scrolls: false,
    more: false,
    moved: false,
  });

  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    function update() {
      if (!box) return;
      const wide = box.scrollWidth > box.clientWidth + 2;
      // Focusable when it scrolls either way, so keyboards can reach it.
      const tall = box.scrollHeight > box.clientHeight + 2;
      const next = {
        wide,
        scrolls: wide || tall,
        more: wide && box.scrollLeft + box.clientWidth < box.scrollWidth - 4,
        moved: box.scrollLeft > 4,
      };
      // Scroll events are frequent; only re-render when something changed.
      setState((prev) =>
        prev.wide === next.wide &&
        prev.scrolls === next.scrolls &&
        prev.more === next.more &&
        prev.moved === next.moved
          ? prev
          : next,
      );
    }
    update();
    box.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => {
      box.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div>
      {state.wide && (
        <p
          aria-hidden
          className={`text-muted mb-2 flex items-center gap-1.5 text-xs transition-opacity duration-200 ${state.moved ? "opacity-0" : "opacity-100"}`}
        >
          Swipe sideways for more columns
          <ArrowRight size={12} weight="bold" />
        </p>
      )}
      <div className="relative">
        <div
          ref={ref}
          role="region"
          aria-label={label}
          tabIndex={state.scrolls ? 0 : -1}
          className={`focus-visible:outline-accent overflow-auto focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
        >
          {children}
        </div>
        <div
          aria-hidden
          className={`from-paper pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l to-transparent transition-opacity duration-200 ${state.more ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    </div>
  );
}
