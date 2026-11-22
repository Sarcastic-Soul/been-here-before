/**
 * Scoring helpers for the walk-forward test. Pure functions, safe to import
 * from scripts and from the app.
 */

/** Squared-error sums for one test date. */
export interface DateScore {
  testDate: string;
  /** Coin-dates that got a prediction on this date. */
  n: number;
  /** Sum of (p - y)^2 for the tool. */
  brier: number;
  /** Sum of (base - y)^2 for the baseline. */
  base: number;
}

export interface YearScore {
  year: number;
  n: number;
  brier: number;
  brierBaseline: number;
  /** 1 - brier / brierBaseline. Positive means the tool beat the baseline. */
  gain: number;
}

/** Share by which the tool's Brier score is below the baseline's. */
export function brierGain(scores: readonly DateScore[]): number {
  const brier = scores.reduce((sum, s) => sum + s.brier, 0);
  const base = scores.reduce((sum, s) => sum + s.base, 0);
  return base === 0 ? 0 : 1 - brier / base;
}

export function byYear(scores: readonly DateScore[]): YearScore[] {
  const years = new Map<number, DateScore[]>();
  for (const score of scores) {
    const year = Number(score.testDate.slice(0, 4));
    years.set(year, [...(years.get(year) ?? []), score]);
  }
  return [...years]
    .sort((a, b) => a[0] - b[0])
    .map(([year, list]) => {
      const n = list.reduce((sum, s) => sum + s.n, 0);
      const brier = list.reduce((sum, s) => sum + s.brier, 0);
      const base = list.reduce((sum, s) => sum + s.base, 0);
      return {
        year,
        n,
        brier: n ? brier / n : 0,
        brierBaseline: n ? base / n : 0,
        gain: brierGain(list),
      };
    });
}

/** Small seeded generator so the interval is the same on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 95% interval for the Brier gain from a circular block bootstrap over test
 * dates. Test dates a quarter apart share most of their 2-year outcome
 * window, so dates are resampled in runs of `block` consecutive dates
 * (8 quarters = 2 years) instead of one by one.
 */
export function gainInterval(
  scores: readonly DateScore[],
  { block = 8, draws = 5000, seed = 20261122 } = {},
): { lo: number; hi: number } {
  const count = scores.length;
  if (count === 0) return { lo: 0, hi: 0 };
  const size = Math.min(block, count);
  const random = mulberry32(seed);
  const gains: number[] = [];
  for (let d = 0; d < draws; d++) {
    const sample: DateScore[] = [];
    while (sample.length < count) {
      const start = Math.floor(random() * count);
      for (let j = 0; j < size && sample.length < count; j++)
        sample.push(scores[(start + j) % count]);
    }
    gains.push(brierGain(sample));
  }
  gains.sort((a, b) => a - b);
  const at = (q: number) =>
    gains[Math.min(draws - 1, Math.max(0, Math.round(q * (draws - 1))))];
  return { lo: at(0.025), hi: at(0.975) };
}
