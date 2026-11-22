import { cycleOf } from "./cycles";
import type { Cycle } from "./types";

export interface BandStep {
  /** Rank band is rank / factor to rank * factor. */
  rankFactor: number;
  /** Drawdown band is plus or minus this many points (0.1 = 10 points). */
  drawdownBand: number;
}

/**
 * Match bands. Step 0 is the standard match, fixed before looking at results.
 * When it finds fewer than MIN_EPISODES, the next step is tried, in this
 * fixed order, and the page says which step was used. The wider steps were
 * added on 22 Nov 2026 because the largest coins had too few twins; see
 * METHODOLOGY.md. The age bucket never widens.
 */
export const BAND_STEPS: readonly BandStep[] = [
  { rankFactor: 1.5, drawdownBand: 0.1 },
  { rankFactor: 2, drawdownBand: 0.15 },
  { rankFactor: 3, drawdownBand: 0.2 },
  { rankFactor: 4, drawdownBand: 0.25 },
];
export const STANDARD = BAND_STEPS[0];
export const RANK_FACTOR = STANDARD.rankFactor;
export const DRAWDOWN_BAND = STANDARD.drawdownBand;
/** BTC holds adjusted rank 1 and is the benchmark, so it is never a twin. */
const MIN_TWIN_RANK = 2;
export const AGE_BUCKETS = [
  { max: 52, label: "under 1 year" },
  { max: 104, label: "1 to 2 years" },
  { max: 208, label: "2 to 4 years" },
  { max: Infinity, label: "over 4 years" },
] as const;

export interface MatchState {
  rankAdj: number;
  drawdown: number;
  ageWeeks: number;
}

export interface CandidateRow extends MatchState {
  lineageId: number;
  /** YYYY-MM-DD */
  week: string;
}

export function ageBucket(ageWeeks: number): number {
  return AGE_BUCKETS.findIndex((bucket) => ageWeeks < bucket.max);
}

export function rankBand(
  rankAdj: number,
  step: BandStep = STANDARD,
): { min: number; max: number } {
  return {
    min: Math.max(MIN_TWIN_RANK, Math.ceil(rankAdj / step.rankFactor)),
    max: Math.floor(rankAdj * step.rankFactor),
  };
}

export function inBands(
  target: MatchState,
  row: MatchState,
  step: BandStep = STANDARD,
): boolean {
  const band = rankBand(target.rankAdj, step);
  return (
    row.rankAdj >= band.min &&
    row.rankAdj <= band.max &&
    Math.abs(row.drawdown - target.drawdown) <= step.drawdownBand &&
    ageBucket(row.ageWeeks) === ageBucket(target.ageWeeks)
  );
}

/**
 * One episode per lineage per cycle: the first week that lineage entered the
 * bands in that cycle. Stops near-copy weeks from inflating n.
 */
export function selectEpisodes<T extends CandidateRow>(
  rows: readonly T[],
  target: MatchState,
  excludeLineage: number | null,
  step: BandStep = STANDARD,
): (T & { cycle: Cycle })[] {
  const first = new Map<string, T & { cycle: Cycle }>();
  for (const row of rows) {
    if (row.lineageId === excludeLineage || !inBands(target, row, step))
      continue;
    const cycle = cycleOf(row.week);
    const key = `${row.lineageId}:${cycle}`;
    const seen = first.get(key);
    if (!seen || row.week < seen.week) first.set(key, { ...row, cycle });
  }
  return [...first.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/** Distance in band widths: 0 is identical, 1 is the edge of a band. */
export function twinDistance(target: MatchState, row: MatchState): number {
  const rank =
    Math.abs(Math.log(row.rankAdj / target.rankAdj)) / Math.log(RANK_FACTOR);
  const drawdown = Math.abs(row.drawdown - target.drawdown) / DRAWDOWN_BAND;
  const age =
    Math.abs(Math.log((row.ageWeeks + 26) / (target.ageWeeks + 26))) /
    Math.log(2);
  return Math.hypot(rank, drawdown, age * 0.5);
}

/** The k closest episodes, at most one per lineage. */
export function nearestTwins<T extends CandidateRow>(
  episodes: readonly T[],
  target: MatchState,
  k = 5,
): T[] {
  const best = new Map<number, { row: T; distance: number }>();
  for (const row of episodes) {
    const distance = twinDistance(target, row);
    const seen = best.get(row.lineageId);
    if (!seen || distance < seen.distance)
      best.set(row.lineageId, { row, distance });
  }
  return [...best.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k)
    .map((entry) => entry.row);
}
