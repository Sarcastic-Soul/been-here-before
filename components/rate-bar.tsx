import type { Rate } from "@/lib/engine/stats";
import { pct, pctRange } from "@/lib/format";

/** A share with its Wilson 95% range drawn on a 0–100% track. */
export function RateBar({ rate, width = 120 }: { rate: Rate; width?: number }) {
  const x = (share: number) => 1 + share * (width - 2);
  return (
    <svg
      width={width}
      height={14}
      role="img"
      aria-label={`${pct(rate.p)}, 95% range ${pctRange(rate.lo, rate.hi)}`}
      className="block"
    >
      <line
        x1={1}
        x2={width - 1}
        y1={7}
        y2={7}
        stroke="var(--grid)"
        strokeWidth={2}
      />
      <line
        x1={x(0.5)}
        x2={x(0.5)}
        y1={2}
        y2={12}
        stroke="var(--rule)"
        strokeWidth={1}
      />
      <line
        x1={x(rate.lo)}
        x2={x(rate.hi)}
        y1={7}
        y2={7}
        stroke="var(--ink)"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle
        cx={x(rate.p)}
        cy={7}
        r={4}
        fill="var(--accent)"
        stroke="var(--paper)"
        strokeWidth={1.5}
      />
    </svg>
  );
}
