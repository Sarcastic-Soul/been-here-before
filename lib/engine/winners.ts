/**
 * What set the winners apart: the matched episodes split into those that beat
 * BTC over 2 years and the rest, compared on what was known at the start week.
 * Display only. Nothing here feeds the verdict.
 */
import { median } from "./stats";

export type FeatureKey =
  "drawdown" | "weeksSincePeak" | "turnover" | "ageWeeks" | "rankAdj";

export type FeatureUnit = "pct" | "weeks" | "rank";

/** Start-week facts about one episode. Missing values are left out per feature. */
export interface WinnerInput {
  beatBtc104w: boolean;
  drawdown: number;
  weeksSincePeak?: number | null;
  /** 24h volume divided by market cap. */
  turnover?: number | null;
  ageWeeks: number;
  rankAdj: number;
}

export interface WinnerFeature {
  key: FeatureKey;
  label: string;
  unit: FeatureUnit;
  /** Median among episodes that beat BTC. */
  winners: number | null;
  /** Median among the rest. */
  rest: number | null;
  /**
   * Over every winner and other pair, how often the winner had the higher
   * value (ties count half). 0.5 means no difference.
   */
  higherShare: number | null;
  /** Plain words for a high share and for a low one. */
  more: string;
  less: string;
}

export interface WinnerSplit {
  winners: number;
  rest: number;
  features: WinnerFeature[];
}

const FEATURES: readonly {
  key: FeatureKey;
  label: string;
  unit: FeatureUnit;
  more: string;
  less: string;
  get: (row: WinnerInput) => number | null | undefined;
}[] = [
  {
    key: "drawdown",
    label: "Drop from its peak",
    unit: "pct",
    more: "had dropped further from their peak",
    less: "had dropped less from their peak",
    get: (row) => row.drawdown,
  },
  {
    key: "weeksSincePeak",
    label: "Time since its peak",
    unit: "weeks",
    more: "had been off their peak for longer",
    less: "were closer in time to their peak",
    get: (row) => row.weeksSincePeak,
  },
  {
    key: "turnover",
    label: "Daily volume ÷ market cap",
    unit: "pct",
    more: "traded more for their size",
    less: "traded less for their size",
    get: (row) => row.turnover,
  },
  {
    key: "ageWeeks",
    label: "Age",
    unit: "weeks",
    more: "were older",
    less: "were younger",
    get: (row) => row.ageWeeks,
  },
  {
    key: "rankAdj",
    label: "Rank",
    unit: "rank",
    more: "ranked lower",
    less: "ranked higher",
    get: (row) => row.rankAdj,
  },
];

/** Share of (a, b) pairs with a > b, ties counted half. */
export function higherShare(
  a: readonly number[],
  b: readonly number[],
): number | null {
  if (a.length === 0 || b.length === 0) return null;
  const sorted = [...b].sort((x, y) => x - y);
  let wins = 0;
  for (const value of a) {
    const below = lowerBound(sorted, value);
    const ties = lowerBound(sorted, value, true) - below;
    wins += below + ties / 2;
  }
  return wins / (a.length * b.length);
}

/** Index of the first item >= value (or > value when strict). */
function lowerBound(sorted: readonly number[], value: number, strict = false) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (strict ? sorted[mid] <= value : sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function values(
  rows: readonly WinnerInput[],
  get: (typeof FEATURES)[number]["get"],
) {
  const out: number[] = [];
  for (const row of rows) {
    const value = get(row);
    if (typeof value === "number" && Number.isFinite(value)) out.push(value);
  }
  return out;
}

export function compareWinners(rows: readonly WinnerInput[]): WinnerSplit {
  const won = rows.filter((row) => row.beatBtc104w);
  const lost = rows.filter((row) => !row.beatBtc104w);
  return {
    winners: won.length,
    rest: lost.length,
    features: FEATURES.map(({ get, ...feature }) => {
      const a = values(won, get);
      const b = values(lost, get);
      return {
        ...feature,
        winners: median(a),
        rest: median(b),
        higherShare: higherShare(a, b),
      };
    }),
  };
}

/** Below this many winners the panel is not shown at all. */
export const MIN_WINNERS = 5;
/** A share this far from 0.5 is called out in words. */
export const NOTABLE_GAP = 0.1;

/** The feature with the biggest gap, when it is big enough to mention. */
export function clearestFeature(split: WinnerSplit): WinnerFeature | null {
  let best: WinnerFeature | null = null;
  for (const feature of split.features) {
    if (feature.higherShare === null) continue;
    const gap = Math.abs(feature.higherShare - 0.5);
    if (gap < NOTABLE_GAP) continue;
    if (!best || gap > Math.abs((best.higherShare ?? 0.5) - 0.5))
      best = feature;
  }
  return best;
}
