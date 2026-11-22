/**
 * Pure logic for the daily refresh: one listings/latest response in, today's
 * state per coin out. Same definitions as the weekly panel: adjusted rank
 * skips excluded coins, prices and peaks are in lineage-root units, and the
 * running peak only ever looks backwards.
 */
import { isExcludedAsset } from "@/lib/engine/universe";

const WEEK_MS = 7 * 86_400_000;

export interface ListingRow {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmcRank: number;
  price: number;
  marketCap: number | null;
  volume24h: number | null;
  dateAdded: string | null;
  tags: string[];
  isToken: boolean;
}

export interface KnownCoin {
  lineageId: number;
  priceFactor: number;
  excludedReason: string | null;
}

/** What is already known about a lineage: its peak so far and when it was born. */
export interface Anchor {
  runningPeak: number;
  peakAt: Date;
  bornAt: Date;
}

export interface StateRow {
  coinId: number;
  lineageId: number;
  rankRaw: number;
  rankAdj: number;
  priceUsd: number;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  runningPeakUsd: number;
  drawdown: number;
  weeksSincePeak: number;
  ageWeeks: number;
  peakAt: Date;
  bornAt: Date;
}

export interface NewCoin {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  dateAdded: string | null;
  isToken: boolean;
  excludedReason: string | null;
}

export function dailyStates(
  rows: readonly ListingRow[],
  known: ReadonlyMap<number, KnownCoin>,
  anchors: ReadonlyMap<number, Anchor>,
  asOf: Date,
): { states: StateRow[]; newCoins: NewCoin[]; excluded: number } {
  const sorted = rows
    .filter((row) => row.price > 0)
    .sort((a, b) => a.cmcRank - b.cmcRank || a.id - b.id);
  const states: StateRow[] = [];
  const newCoins: NewCoin[] = [];
  const seenLineages = new Set<number>();
  let adjusted = 0;
  let excluded = 0;

  for (const row of sorted) {
    const coin = known.get(row.id);
    const excludedReason =
      coin?.excludedReason ??
      (isExcludedAsset({ ...row, tags: row.tags }) ? "rule" : null);
    if (!coin) {
      newCoins.push({
        id: row.id,
        name: row.name,
        symbol: row.symbol,
        slug: row.slug,
        dateAdded: row.dateAdded,
        isToken: row.isToken,
        excludedReason,
      });
    }
    if (excludedReason) {
      excluded++;
      continue;
    }
    adjusted++;

    const lineageId = coin?.lineageId ?? row.id;
    if (seenLineages.has(lineageId)) continue; // old and new id both listed: keep the better ranked one
    seenLineages.add(lineageId);

    const rootPrice = row.price * (coin?.priceFactor ?? 1);
    const anchor = anchors.get(lineageId);
    const listed = row.dateAdded ? new Date(row.dateAdded) : asOf;
    const bornAt = anchor ? anchor.bornAt : listed;
    const newPeak = !anchor || rootPrice >= anchor.runningPeak;
    const runningPeak = newPeak ? rootPrice : anchor.runningPeak;
    const peakAt = newPeak ? asOf : anchor.peakAt;

    states.push({
      coinId: row.id,
      lineageId,
      rankRaw: row.cmcRank,
      rankAdj: adjusted,
      priceUsd: row.price,
      marketCapUsd: row.marketCap,
      volume24hUsd: row.volume24h,
      runningPeakUsd: runningPeak,
      drawdown: runningPeak > 0 ? 1 - rootPrice / runningPeak : 0,
      weeksSincePeak: Math.max(
        0,
        Math.floor((asOf.getTime() - peakAt.getTime()) / WEEK_MS),
      ),
      ageWeeks: Math.max(
        0,
        Math.floor((asOf.getTime() - bornAt.getTime()) / WEEK_MS),
      ),
      peakAt,
      bornAt,
    });
  }
  return { states, newCoins, excluded };
}
