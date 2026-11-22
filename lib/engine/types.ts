/** One weekly observation of a lineage. `week` is an index into the weeks array. */
export interface SeriesPoint {
  week: number;
  /** CMC id the row came from (can differ from the lineage root after a migration). */
  coinId: number;
  rankRaw: number;
  /** Rank among coins left after removing stablecoins and wrapped/staked tokens. */
  rankAdj: number;
  /** Price in lineage-root units (a successor's price times the swap ratio). */
  price: number;
  marketCap: number;
  volume24h: number;
  /**
   * True for a merge successor's rows after the swap (for example FET rows on
   * the AGIX lineage). Used only to follow returns, never to start an episode.
   */
  continuation: boolean;
}

export interface Features {
  runningPeak: number;
  drawdown: number;
  weeksSincePeak: number;
  ageWeeks: number;
}

export interface Outcome {
  /** False when week + horizon is after the last snapshot. */
  complete: boolean;
  /** Coin return over the horizon, -1 when it fell out. Null if incomplete. */
  coinReturn: number | null;
  btcReturn: number | null;
  beatBtc: boolean | null;
  fellOut: boolean | null;
  reachedTop20: boolean | null;
}

export type Cycle = "2012-16" | "2016-20" | "2020-24" | "2024-28";
