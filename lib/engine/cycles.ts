import type { Cycle } from "./types";

/** Bitcoin halving eras, used to split results so one era can't hide in the total. */
export const CYCLES: readonly { cycle: Cycle; from: string; label: string }[] =
  [
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

/** Market phases in display order, with the rule behind each. */
export const PHASES: readonly { phase: Phase; label: string; rule: string }[] =
  [
    {
      phase: "near_peak",
      label: "Near the peak",
      rule: "total market cap less than 20% below its peak so far",
    },
    {
      phase: "correction",
      label: "Correction",
      rule: "total market cap 20% to 50% below its peak so far",
    },
    {
      phase: "bear",
      label: "Bear market",
      rule: "total market cap more than 50% below its peak so far",
    },
    {
      phase: "recovery",
      label: "Recovery",
      rule: "more than 20% below the peak, but higher than a year earlier",
    },
  ];

/**
 * Market phase from total market cap, using only weeks up to each point.
 * Recovery: drawdown over 20% but market cap up over the last 52 weeks.
 */
export function marketPhases(
  totalMarketCap: readonly number[],
): { drawdown: number; phase: Phase }[] {
  let peak = 0;
  return totalMarketCap.map((cap, week) => {
    peak = Math.max(peak, cap);
    const yearAgo = week >= 52 ? totalMarketCap[week - 52] : null;
    return phaseOf(cap, peak, yearAgo);
  });
}

/** One point's phase, given the peak so far (including this point) and the cap a year earlier. */
export function phaseOf(
  cap: number,
  peak: number,
  yearAgo: number | null,
): { drawdown: number; phase: Phase } {
  const drawdown = peak > 0 ? 1 - cap / peak : 0;
  let phase: Phase =
    drawdown < 0.2 ? "near_peak" : drawdown <= 0.5 ? "correction" : "bear";
  if (drawdown > 0.2 && yearAgo && cap > yearAgo) phase = "recovery";
  return { drawdown, phase };
}

/**
 * Today's phase from the daily global-metrics call, measured against the
 * stored weekly history with the same rule. Weeks after today are ignored;
 * "a year earlier" is the last weekly snapshot at least 52 weeks back.
 */
export function phaseToday(
  weekly: readonly { week: string; cap: number | null }[],
  today: { day: string; cap: number },
): { drawdown: number; phase: Phase } {
  const yearAgoDay = new Date(
    Date.parse(`${today.day}T00:00:00Z`) - 364 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  let peak = today.cap;
  let yearAgo: { week: string; cap: number } | null = null;
  for (const { week, cap } of weekly) {
    if (cap === null || week > today.day) continue;
    peak = Math.max(peak, cap);
    if (week <= yearAgoDay && (!yearAgo || week > yearAgo.week))
      yearAgo = { week, cap };
  }
  return phaseOf(today.cap, peak, yearAgo?.cap ?? null);
}
