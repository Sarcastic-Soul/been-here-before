/**
 * Pure verdict logic: candidate rows in, episodes, rates and verdict out.
 * The database layer (get-verdict.ts) only fetches rows; everything that
 * decides the answer lives here so it can be tested with synthetic data.
 */
import {
  AGE_BUCKETS,
  ageBucket,
  BAND_STEPS,
  nearestTwins,
  rankBand,
  selectEpisodes,
  STANDARD,
  type BandStep,
  type CandidateRow,
  type MatchState,
} from "@/lib/engine/match";
import { clusteredRate, halfYear } from "@/lib/engine/stats";
import {
  decide,
  summarize,
  summarizeByCycle,
  VERDICT_TEXT,
  type EpisodeOutcome,
} from "@/lib/engine/verdict";

import type { Bands, EpisodeRow, TwinPoint, VerdictOk } from "./types";

export const HORIZON_WEEKS = 104;
export const TWIN_COUNT = 5;

export interface OutcomeRow extends CandidateRow {
  coinId: number;
  ret104w: number;
  beatBtc104w: boolean;
  beatBtc52w: boolean | null;
  fellOut104w: boolean;
  reachedTop20: boolean;
}

export function addWeeks(day: string, weeks: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + weeks * 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** The SQL prefilter. Slightly wider than the bands; selectEpisodes applies the exact test. */
export function queryBands(target: MatchState, step: BandStep = STANDARD) {
  const rank = rankBand(target.rankAdj, step);
  const bucket = ageBucket(target.ageWeeks);
  const ageMax = AGE_BUCKETS[bucket].max;
  return {
    rankMin: rank.min,
    rankMax: rank.max,
    drawdownMin: target.drawdown - step.drawdownBand - 1e-4,
    drawdownMax: target.drawdown + step.drawdownBand + 1e-4,
    ageMin: bucket === 0 ? 0 : AGE_BUCKETS[bucket - 1].max,
    ageMax: Number.isFinite(ageMax) ? ageMax : null,
  };
}

export function describeBands(
  target: MatchState,
  stepIndex = 0,
  tried: readonly number[] = [],
): Bands {
  const step = BAND_STEPS[stepIndex];
  const rank = rankBand(target.rankAdj, step);
  return {
    rankMin: rank.min,
    rankMax: rank.max,
    drawdownMin: Math.max(0, target.drawdown - step.drawdownBand),
    drawdownMax: Math.min(1, target.drawdown + step.drawdownBand),
    ageLabel: AGE_BUCKETS[ageBucket(target.ageWeeks)].label,
    step: stepIndex,
    rankFactor: step.rankFactor,
    drawdownBand: step.drawdownBand,
    tried: [...tried],
  };
}

/** How many episodes a step keeps, for deciding whether to widen. */
export function episodeCount(
  rows: readonly CandidateRow[],
  target: MatchState,
  lineageId: number,
  stepIndex: number,
): number {
  return selectEpisodes(rows, target, lineageId, BAND_STEPS[stepIndex]).length;
}

export type Analysis = Pick<
  VerdictOk,
  | "bands"
  | "verdict"
  | "verdictText"
  | "summary"
  | "beatBtc1y"
  | "survivorsOnly"
  | "byCycle"
  | "episodes"
> & { twinEpisodes: EpisodeRow[] };

/**
 * @param target      today's state of the coin being asked about
 * @param lineageId   its lineage, left out of its own twins
 * @param rows        candidate rows with a finished 2-year outcome
 * @param btcByWeek   BTC price per snapshot week
 * @param names       name and symbol per CMC id, for display
 * @param stepIndex   which BAND_STEPS entry the rows were matched with
 * @param tried       episodes found at each step tried before this one
 * @param alive       lineages still in the latest weekly top 5,000
 */
export function analyze(
  target: MatchState,
  lineageId: number,
  rows: readonly OutcomeRow[],
  btcByWeek: ReadonlyMap<string, number>,
  names: ReadonlyMap<number, { name: string; symbol: string }>,
  stepIndex = 0,
  tried: readonly number[] = [],
  alive: ReadonlySet<number> = new Set(),
): Analysis {
  const picked = selectEpisodes(rows, target, lineageId, BAND_STEPS[stepIndex]);
  const episodes: EpisodeRow[] = picked.map((row) => {
    const btcStart = btcByWeek.get(row.week);
    const btcEnd = btcByWeek.get(addWeeks(row.week, HORIZON_WEEKS));
    const label = names.get(row.coinId);
    return {
      lineageId: row.lineageId,
      coinId: row.coinId,
      name: label?.name ?? `#${row.coinId}`,
      symbol: label?.symbol ?? "",
      week: row.week,
      cycle: row.cycle,
      rankAdj: row.rankAdj,
      drawdown: row.drawdown,
      ageWeeks: row.ageWeeks,
      ret104w: row.ret104w,
      btcRet104w: btcStart && btcEnd ? btcEnd / btcStart - 1 : null,
      beatBtc104w: row.beatBtc104w,
      beatBtc52w: row.beatBtc52w,
      fellOut104w: row.fellOut104w,
      reachedTop20: row.reachedTop20,
      aliveToday: alive.has(row.lineageId),
    };
  });

  const outcomes: EpisodeOutcome[] = episodes.map((e) => ({
    lineageId: e.lineageId,
    week: e.week,
    cycle: e.cycle,
    beatBtc: e.beatBtc104w,
    fellOut: e.fellOut104w,
    reachedTop20: e.reachedTop20,
    coinReturn: e.ret104w,
    btcReturn: e.btcRet104w,
  }));
  const summary = summarize(outcomes);
  const verdict = decide(summary);
  const twinEpisodes = nearestTwins(episodes, target, TWIN_COUNT);

  return {
    bands: describeBands(target, stepIndex, tried.length ? tried : [summary.n]),
    verdict,
    verdictText: VERDICT_TEXT[verdict],
    summary,
    beatBtc1y: clusteredRate(
      episodes.filter((e) => e.beatBtc52w !== null),
      (e) => e.beatBtc52w === true,
      (e) => halfYear(e.week),
    ),
    survivorsOnly: clusteredRate(
      episodes.filter((e) => e.aliveToday),
      (e) => e.beatBtc104w,
      (e) => halfYear(e.week),
    ),
    byCycle: summarizeByCycle(outcomes),
    episodes,
    twinEpisodes,
  };
}

/**
 * A twin's path over its next 104 weeks: price relative to BTC, 100 at the
 * start. The path stops where the coin fell out of the snapshots.
 */
export function twinPath(
  start: string,
  rows: readonly { week: string; priceUsd: number }[],
  btcByWeek: ReadonlyMap<string, number>,
): TwinPoint[] {
  const first = rows.find((row) => row.week === start);
  const btcStart = btcByWeek.get(start);
  if (!first || !btcStart) return [];
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const path: TwinPoint[] = [];
  for (const row of rows) {
    const t = Math.round(
      (Date.parse(`${row.week}T00:00:00Z`) - startMs) / (7 * 86_400_000),
    );
    const btc = btcByWeek.get(row.week);
    if (t < 0 || t > HORIZON_WEEKS || !btc) continue;
    path.push({
      t,
      vsBtc: Number(
        ((row.priceUsd / first.priceUsd / (btc / btcStart)) * 100).toFixed(3),
      ),
    });
  }
  return path;
}
