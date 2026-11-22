import { CYCLES } from "./cycles";
import { median, rateOf, type Rate } from "./stats";
import type { Cycle } from "./types";

export const MIN_EPISODES = 20;
/** Upper Wilson bound below this: history favors rotating to BTC. */
export const ROTATE_BELOW = 0.35;
/** Lower Wilson bound above this: history favors holding. */
export const HOLD_ABOVE = 0.5;

export interface EpisodeOutcome {
  lineageId: number;
  cycle: Cycle;
  beatBtc: boolean;
  fellOut: boolean;
  reachedTop20: boolean;
  coinReturn: number;
  btcReturn: number;
}

export interface Summary {
  n: number;
  distinctCoins: number;
  beatBtc: Rate;
  reachedTop20: Rate;
  fellOut: Rate;
  medianCoinReturn: number | null;
  medianExcessReturn: number | null;
}

export type VerdictKind = "not_enough_history" | "rotate" | "hold" | "no_clear_edge";

export const VERDICT_TEXT: Record<VerdictKind, string> = {
  not_enough_history: "Not enough history",
  rotate: "History favors rotating to BTC",
  hold: "History favors holding",
  no_clear_edge: "No clear edge",
};

export function summarize(episodes: readonly EpisodeOutcome[]): Summary {
  return {
    n: episodes.length,
    distinctCoins: new Set(episodes.map((e) => e.lineageId)).size,
    beatBtc: rateOf(episodes, (e) => e.beatBtc),
    reachedTop20: rateOf(episodes, (e) => e.reachedTop20),
    fellOut: rateOf(episodes, (e) => e.fellOut),
    medianCoinReturn: median(episodes.map((e) => e.coinReturn)),
    medianExcessReturn: median(episodes.map((e) => e.coinReturn - e.btcReturn)),
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

export function decide(summary: Summary): VerdictKind {
  if (summary.n < MIN_EPISODES) return "not_enough_history";
  if (summary.beatBtc.hi < ROTATE_BELOW) return "rotate";
  if (summary.beatBtc.lo > HOLD_ABOVE) return "hold";
  return "no_clear_edge";
}
