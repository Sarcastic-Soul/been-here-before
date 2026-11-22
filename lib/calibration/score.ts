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

/** Adjusted ranks the walk-forward test covers. Rank 1 is BTC, the benchmark. */
export const RANK_MIN = 2;
export const RANK_MAX = 1000;

/** Rank bands for the breakdown. Together they cover RANK_MIN to RANK_MAX. */
export const RANK_BANDS = [
  { label: "2-19", min: 2, max: 19 },
  { label: "20-500", min: 20, max: 500 },
  { label: "501-1000", min: 501, max: 1000 },
] as const;

/** Index into RANK_BANDS for an adjusted rank, or -1 when it is outside the test. */
export function bandIndex(rankAdj: number): number {
  return RANK_BANDS.findIndex((b) => rankAdj >= b.min && rankAdj <= b.max);
}

/** How many times a verdict was given and how many of those coins then beat BTC. */
export interface VerdictCount {
  n: number;
  beat: number;
}

/** Results for one rank band. */
export interface BandScore {
  /** For example "20-500". */
  band: string;
  min: number;
  max: number;
  /** Coin-dates tested in this band. */
  tested: number;
  /** Coin-dates that got a prediction. */
  predicted: number;
  /** Mean squared error of the tool's predictions. */
  brier: number;
  /** Mean squared error of this band's own base rate known at each date. */
  brierBaseline: number;
  /** 1 - brier / brierBaseline. */
  gain: number;
  verdicts: Record<string, VerdictCount>;
}

/** Running sums for one rank band while the test loops over dates. */
export interface BandSums {
  tested: number;
  predicted: number;
  brier: number;
  base: number;
  verdicts: Record<string, VerdictCount>;
}

export function emptyBandSums(verdictKeys: readonly string[]): BandSums {
  return {
    tested: 0,
    predicted: 0,
    brier: 0,
    base: 0,
    verdicts: Object.fromEntries(
      verdictKeys.map((k) => [k, { n: 0, beat: 0 }]),
    ),
  };
}

/** Turn running sums into the per-band result stored with the calibration. */
export function toBandScore(
  band: { label: string; min: number; max: number },
  sums: BandSums,
): BandScore {
  const { predicted } = sums;
  return {
    band: band.label,
    min: band.min,
    max: band.max,
    tested: sums.tested,
    predicted,
    brier: predicted ? sums.brier / predicted : 0,
    brierBaseline: predicted ? sums.base / predicted : 0,
    gain: sums.base === 0 ? 0 : 1 - sums.brier / sums.base,
    verdicts: sums.verdicts,
  };
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
