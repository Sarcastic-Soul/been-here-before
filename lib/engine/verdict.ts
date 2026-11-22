import { CYCLES, PHASES, type Phase } from "./cycles";
import { clusteredRate, halfYear, median, type Rate } from "./stats";
import type { Cycle } from "./types";

export const MIN_EPISODES = 20;
/** Upper Wilson bound below this: history favors rotating to BTC. */
export const ROTATE_BELOW = 0.35;
/** Lower Wilson bound above this: history favors holding. */
export const HOLD_ABOVE = 0.5;

export interface EpisodeOutcome {
  lineageId: number;
  /** Start week, used to group episodes that share a market. */
  week: string;
  /** Market phase in the start week, when known. */
  phase?: Phase;
  cycle: Cycle;
  beatBtc: boolean;
  fellOut: boolean;
  reachedTop20: boolean;
  coinReturn: number;
  /** Null when BTC's price at the start or end week is unknown. */
  btcReturn: number | null;
}

export interface Summary {
  n: number;
  distinctCoins: number;
  /** Calendar half-years the episodes start in. Missing in old saved copies. */
  clusters?: number;
  /** Ranges use an effective n that allows for episodes bunched in time. */
  beatBtc: Rate;
  reachedTop20: Rate;
  fellOut: Rate;
  medianCoinReturn: number | null;
  medianExcessReturn: number | null;
}

export type VerdictKind =
  "not_enough_history" | "rotate" | "hold" | "no_clear_edge";

export const VERDICT_TEXT: Record<VerdictKind, string> = {
  not_enough_history: "Not enough history",
  rotate: "History favors rotating to BTC",
  hold: "History favors holding",
  no_clear_edge: "No clear edge",
};

export function summarize(episodes: readonly EpisodeOutcome[]): Summary {
  const rate = (hit: (e: EpisodeOutcome) => boolean) =>
    clusteredRate(episodes, hit, (e) => halfYear(e.week));
  return {
    n: episodes.length,
    distinctCoins: new Set(episodes.map((e) => e.lineageId)).size,
    clusters: new Set(episodes.map((e) => halfYear(e.week))).size,
    beatBtc: rate((e) => e.beatBtc),
    reachedTop20: rate((e) => e.reachedTop20),
    fellOut: rate((e) => e.fellOut),
    medianCoinReturn: median(episodes.map((e) => e.coinReturn)),
    medianExcessReturn: median(
      episodes.flatMap((e) =>
        e.btcReturn === null ? [] : [e.coinReturn - e.btcReturn],
      ),
    ),
  };
}

export function summarizeByCycle(
  episodes: readonly EpisodeOutcome[],
): { cycle: Cycle; label: string; summary: Summary }[] {
  return CYCLES.map(({ cycle, label }) => ({
    cycle,
    label,
    summary: summarize(episodes.filter((e) => e.cycle === cycle)),
  })).filter((entry) => entry.summary.n > 0);
}

export function summarizeByPhase(
  episodes: readonly EpisodeOutcome[],
): { phase: Phase; label: string; summary: Summary }[] {
  return PHASES.map(({ phase, label }) => ({
    phase,
    label,
    summary: summarize(episodes.filter((e) => e.phase === phase)),
  })).filter((entry) => entry.summary.n > 0);
}

export function decide(summary: Summary): VerdictKind {
  if (summary.n < MIN_EPISODES) return "not_enough_history";
  if (summary.beatBtc.hi < ROTATE_BELOW) return "rotate";
  if (summary.beatBtc.lo > HOLD_ABOVE) return "hold";
  return "no_clear_edge";
}
