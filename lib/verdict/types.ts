/** Response shapes shared by the API routes and the UI. Safe to import anywhere. */
import type { Rate } from "@/lib/engine/stats";
import type { Cycle } from "@/lib/engine/types";
import type { Summary, VerdictKind } from "@/lib/engine/verdict";

export interface CoinInfo {
  id: number;
  lineageId: number;
  name: string;
  symbol: string;
  slug: string;
  status: string;
  dateAdded: string | null;
}

export interface CoinState {
  asOf: string;
  source: "weekly" | "daily";
  rankAdj: number;
  rankRaw: number;
  priceUsd: number;
  marketCapUsd: number | null;
  drawdown: number;
  weeksSincePeak: number;
  ageWeeks: number;
}

export interface Bands {
  rankMin: number;
  rankMax: number;
  drawdownMin: number;
  drawdownMax: number;
  ageLabel: string;
}

export interface EpisodeRow {
  lineageId: number;
  coinId: number;
  name: string;
  symbol: string;
  week: string;
  cycle: Cycle;
  rankAdj: number;
  drawdown: number;
  ageWeeks: number;
  ret104w: number;
  btcRet104w: number | null;
  beatBtc104w: boolean;
  beatBtc52w: boolean | null;
  fellOut104w: boolean;
  reachedTop20: boolean;
}

export interface TwinPoint {
  /** Weeks after the episode start. */
  t: number;
  /** Coin price relative to BTC, 100 at the start. */
  vsBtc: number;
}

export interface Twin {
  episode: EpisodeRow;
  path: TwinPoint[];
}

export interface CycleRow {
  cycle: Cycle;
  label: string;
  summary: Summary;
}

export interface Evidence {
  historyEndpoint: string;
  stateEndpoint: string;
  stateSnapshot: string;
  firstWeek: string;
  lastWeek: string;
  lastCompleteStart: string;
}

export interface VerdictOk {
  status: "ok";
  coin: CoinInfo;
  state: CoinState;
  bands: Bands;
  verdict: VerdictKind;
  verdictText: string;
  summary: Summary;
  beatBtc1y: Rate;
  byCycle: CycleRow[];
  twins: Twin[];
  episodes: EpisodeRow[];
  evidence: Evidence;
}

export interface VerdictRefused {
  status: "not_found" | "excluded" | "not_covered" | "benchmark";
  coin: CoinInfo | null;
  message: string;
}

export type VerdictResponse = VerdictOk | VerdictRefused;

export interface SearchHit {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  rankAdj: number | null;
  live: boolean;
  excluded: boolean;
}
