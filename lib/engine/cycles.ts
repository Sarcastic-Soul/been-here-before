import type { Cycle } from "./types";

/** Bitcoin halving eras, used to split results so one era can't hide in the total. */
export const CYCLES: readonly { cycle: Cycle; from: string; label: string }[] = [
  { cycle: "2012-16", from: "2012-11-28", label: "Nov 2012 to Jul 2016" },
  { cycle: "2016-20", from: "2016-07-09", label: "Jul 2016 to May 2020" },
  { cycle: "2020-24", from: "2020-05-11", label: "May 2020 to Apr 2024" },
  { cycle: "2024-28", from: "2024-04-20", label: "Apr 2024 onward" },
];

export function cycleOf(day: string): Cycle {
  let found: Cycle = CYCLES[0].cycle;
  for (const { cycle, from } of CYCLES) if (day >= from) found = cycle;
  return found;
}

export type Phase = "near_peak" | "correction" | "bear" | "recovery";

/**
 * Market phase from total market cap, using only weeks up to each point.
 * Recovery: drawdown over 20% but market cap up over the last 52 weeks.
 */
export function marketPhases(totalMarketCap: readonly number[]): { drawdown: number; phase: Phase }[] {
  let peak = 0;
  return totalMarketCap.map((cap, week) => {
    peak = Math.max(peak, cap);
    const drawdown = peak > 0 ? 1 - cap / peak : 0;
    const yearAgo = week >= 52 ? totalMarketCap[week - 52] : null;
    let phase: Phase = drawdown < 0.2 ? "near_peak" : drawdown <= 0.5 ? "correction" : "bear";
    if (drawdown > 0.2 && yearAgo && cap > yearAgo) phase = "recovery";
    return { drawdown, phase };
  });
}
