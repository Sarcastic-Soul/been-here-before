import { cycleOf } from "./cycles";
import type { Cycle } from "./types";

/** Match bands, fixed before looking at results (see the method page). */
export const RANK_FACTOR = 1.5;
export const DRAWDOWN_BAND = 0.1;
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

export function rankBand(rankAdj: number): { min: number; max: number } {
  return { min: Math.ceil(rankAdj / RANK_FACTOR), max: Math.floor(rankAdj * RANK_FACTOR) };
}

export function inBands(target: MatchState, row: MatchState): boolean {
  const band = rankBand(target.rankAdj);
  return (
    row.rankAdj >= band.min &&
    row.rankAdj <= band.max &&
    Math.abs(row.drawdown - target.drawdown) <= DRAWDOWN_BAND &&
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
): (T & { cycle: Cycle })[] {
  const first = new Map<string, T & { cycle: Cycle }>();
  for (const row of rows) {
    if (row.lineageId === excludeLineage || !inBands(target, row)) continue;
    const cycle = cycleOf(row.week);
    const key = `${row.lineageId}:${cycle}`;
    const seen = first.get(key);
    if (!seen || row.week < seen.week) first.set(key, { ...row, cycle });
  }
  return [...first.values()].sort((a, b) => a.week.localeCompare(b.week));
}

/** Distance in band widths: 0 is identical, 1 is the edge of a band. */
export function twinDistance(target: MatchState, row: MatchState): number {
  const rank = Math.abs(Math.log(row.rankAdj / target.rankAdj)) / Math.log(RANK_FACTOR);
  const drawdown = Math.abs(row.drawdown - target.drawdown) / DRAWDOWN_BAND;
  const age = Math.abs(Math.log((row.ageWeeks + 26) / (target.ageWeeks + 26))) / Math.log(2);
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
    if (!seen || distance < seen.distance) best.set(row.lineageId, { row, distance });
  }
  return [...best.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k)
    .map((entry) => entry.row);
}
