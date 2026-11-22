/** Response shapes shared by the API routes and the UI. Safe to import anywhere. */
import type { Phase } from "@/lib/engine/cycles";
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
  /** Null in the saved copies under public/precomputed/, which keep derived statistics only. */
  priceUsd: number | null;
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
  /** Which BAND_STEPS entry was used: 0 is the standard match. Missing in old saved copies. */
  step?: number;
  rankFactor?: number;
  drawdownBand?: number;
  /** Episodes found at each step tried, in order. */
  tried?: number[];
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
  /** Its lineage is in the latest weekly top 5,000. Missing in old saved copies. */
  aliveToday?: boolean;
  /** Market phase in the start week. Missing in old saved copies. */
  phase?: Phase;
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

export interface PhaseRow {
  phase: Phase;
  label: string;
  summary: Summary;
}

/** The whole market in the latest weekly snapshot. */
export interface MarketToday {
  week: string;
  phase: Phase;
  /** BTC share of total market cap, 0 to 1. */
  btcDominance: number | null;
  /** Total market cap below its peak so far, 0 to 1. */
  marketDrawdown: number | null;
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
  /**
   * The 2-year beat-BTC rate counting only episodes whose coin is still in the
   * top 5,000 today: what a study that forgot dead coins would report.
   * Missing in old saved copies.
   */
  survivorsOnly?: Rate;
  byCycle: CycleRow[];
  /** Split by market phase in each episode's start week. Missing in old saved copies. */
  byPhase?: PhaseRow[];
  market?: MarketToday;
  twins: Twin[];
  episodes: EpisodeRow[];
  evidence: Evidence;
}

export interface VerdictRefused {
  status: "not_found" | "excluded" | "not_covered" | "benchmark" | "moved";
  coin: CoinInfo | null;
  message: string;
  /** For "moved": the live coin to send the visitor to. */
  movedTo?: { slug: string; name: string };
  /** For a coin no longer in the snapshots: the last week it was seen. */
  lastSeen?: string;
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

export interface Receipt {
  endpoint: string;
  requestUrl: string;
  fetchedAt: string;
  httpStatus: number;
  creditCount: number | null;
  /** CMC's own status block from that response (timestamp, credit count, elapsed). */
  status: Record<string, unknown> | null;
  /** This coin's row, exactly as CMC returned it. Null when the coin was not in the call. */
  row: Record<string, unknown> | null;
}
