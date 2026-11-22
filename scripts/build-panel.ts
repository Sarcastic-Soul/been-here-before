/**
 * Build the weekly panel from the raw snapshots: adjusted ranks, lineages,
 * features (no look-ahead) and forward outcomes. Writes columnar gzipped JSON
 * to data/panel/ for load.ts. Nothing here calls CMC.
 *
 * Pass 1 reads every snapshot and collects coin metadata, so a coin's
 * exclusion (stablecoin, wrapper) is decided on everything known about it.
 * Pass 2 ranks the remaining coins week by week and builds lineages.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { cycleOf, marketPhases } from "@/lib/engine/cycles";
import { computeFeatures } from "@/lib/engine/features";
import { assembleLineages, lineageRootOf, priceFactorOf } from "@/lib/engine/lineage";
import { computeOutcomes } from "@/lib/engine/outcomes";
import type { SeriesPoint } from "@/lib/engine/types";
import { isExcludedAsset, looksPegged, REFERENCE_IDS } from "@/lib/engine/universe";

import { DATA_DIR, LISTINGS_DIR, readJsonGz, writeJsonGz } from "./lib/raw-store";

export const PANEL_DIR = join(DATA_DIR, "panel");
/** Keep lineages that were ever inside this adjusted rank (verdicts cover 1 to 1000). */
const KEEP_RANK = 1500;
/** BTC, ETH, BNB, SOL, LTC, XTZ, DOGE: the build stops if any of these is excluded. */
const MUST_KEEP = [1, 1027, 1839, 5426, 2, 2011, 74];

interface RawRow {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmc_rank: number;
  date_added?: string | null;
  tags?: string[] | null;
  platform?: { id: number } | null;
  quote?: {
    USD?: { price?: number | null; market_cap?: number | null; volume_24h?: number | null };
  };
}

interface Row {
  id: number;
  rank: number;
  price: number;
  marketCap: number;
  volume: number;
}

interface CoinMeta {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  names: Set<string>;
  symbols: Set<string>;
  tags: Set<string>;
  dateAdded: string | null;
  isToken: boolean;
  firstWeek: number;
  lastWeek: number;
  weeks: number[];
  prices: number[];
  bestRank: number;
  excluded: string | null;
}

interface MapRow {
  id: number;
  name: string;
  symbol: string;
  slug: string;
}

interface GlobalQuote {
  timestamp: string;
  btc_dominance: number;
  quote: { USD: { total_market_cap: number } };
}

type Columns = Record<string, unknown[]>;

const columnar = (columns: string[]): Columns =>
  Object.fromEntries(columns.map((name) => [name, []]));

const round = (value: number | null, digits = 6) =>
  value === null || !Number.isFinite(value) ? null : Number(value.toFixed(digits));

function exclusionReason(coin: CoinMeta, refPrice: Record<string, (number | null)[]>): string | null {
  const tags = [...coin.tags];
  for (const name of coin.names) {
    for (const symbol of coin.symbols) {
      if (isExcludedAsset({ id: coin.id, name, symbol, slug: coin.slug, tags })) return "rule";
    }
  }
  if (Object.values(REFERENCE_IDS).includes(coin.id as never)) return null;
  // Old dead coins often show a stale price: flat in USD, or flat in BTC when
  // CMC converted a last BTC trade. Dropping them would hide dead coins, so the
  // USD check needs a token or a dollar-like price, and the crypto checks need
  // a token (every wrapper and liquid-staking coin is a token on some chain).
  const sorted = [...coin.prices].sort((a, b) => a - b);
  const medianPrice = sorted[Math.floor(sorted.length / 2)];
  const dollarLike = medianPrice >= 0.8 && medianPrice <= 1.25;
  const ones = coin.prices.map(() => 1);
  if ((coin.isToken || dollarLike) && looksPegged(coin.prices, ones)) return "pegged:usd";
  if (!coin.isToken) return null;
  for (const [ref, prices] of Object.entries(refPrice)) {
    const reference = coin.weeks.map((week) => prices[week] ?? 0);
    if (looksPegged(coin.prices, reference)) return `pegged:${ref}`;
  }
  return null;
}

async function main() {
  const files = (await readdir(LISTINGS_DIR)).filter((f) => f.endsWith(".json.gz")).sort();
  const weekDates = files.map((f) => f.slice(0, 10));
  const weekIndex = new Map(weekDates.map((day, i) => [day, i]));
  const lastWeek = weekDates.length - 1;
  console.log(`${weekDates.length} weeks, ${weekDates[0]} to ${weekDates[lastWeek]}`);

  // Pass 1: read snapshots once, keep compact rows and metadata.
  const meta = new Map<number, CoinMeta>();
  const rowsByWeek: Row[][] = [];
  const refPrice: Record<string, (number | null)[]> = Object.fromEntries(
    Object.keys(REFERENCE_IDS).map((ref) => [ref, new Array(weekDates.length).fill(null)]),
  );
  const refById = new Map(Object.entries(REFERENCE_IDS).map(([ref, id]) => [id as number, ref]));

  for (const [week, file] of files.entries()) {
    const { data } = await readJsonGz<{ data: RawRow[] }>(join(LISTINGS_DIR, file));
    const rows: Row[] = [];
    for (const raw of data) {
      const usd = raw.quote?.USD;
      if (!usd?.price || usd.price <= 0) continue;
      rows.push({
        id: raw.id,
        rank: raw.cmc_rank,
        price: usd.price,
        marketCap: usd.market_cap ?? 0,
        volume: usd.volume_24h ?? 0,
      });
      const ref = refById.get(raw.id);
      if (ref) refPrice[ref][week] = usd.price;

      let coin = meta.get(raw.id);
      if (!coin) {
        coin = {
          id: raw.id,
          name: raw.name,
          symbol: raw.symbol,
          slug: raw.slug,
          names: new Set(),
          symbols: new Set(),
          tags: new Set(),
          dateAdded: raw.date_added ? raw.date_added.slice(0, 10) : null,
          isToken: false,
          firstWeek: week,
          lastWeek: week,
          weeks: [],
          prices: [],
          bestRank: raw.cmc_rank,
          excluded: null,
        };
        meta.set(raw.id, coin);
      }
      coin.name = raw.name;
      coin.symbol = raw.symbol;
      coin.slug = raw.slug;
      coin.names.add(raw.name);
      coin.symbols.add(raw.symbol);
      for (const tag of raw.tags ?? []) coin.tags.add(tag);
      coin.isToken ||= !!raw.platform;
      coin.lastWeek = week;
      coin.bestRank = Math.min(coin.bestRank, raw.cmc_rank);
      coin.weeks.push(week);
      coin.prices.push(usd.price);
    }
    rows.sort((a, b) => a.rank - b.rank || a.id - b.id);
    rowsByWeek.push(rows);
    if (week % 100 === 0) console.log(`read ${file}: ${rows.length} rows`);
  }

  // Exclusions, decided on everything known about each coin.
  const reasons = new Map<string, number>();
  for (const coin of meta.values()) {
    coin.excluded = exclusionReason(coin, refPrice);
    if (coin.excluded) reasons.set(coin.excluded, (reasons.get(coin.excluded) ?? 0) + 1);
  }
  for (const id of MUST_KEEP) {
    const coin = meta.get(id);
    if (coin?.excluded) throw new Error(`${coin.symbol} (${id}) was excluded: ${coin.excluded}`);
  }
  console.log("excluded:", Object.fromEntries(reasons));
  const review = [...meta.values()]
    .filter((coin) => coin.excluded?.startsWith("pegged") && coin.bestRank <= 300)
    .sort((a, b) => a.bestRank - b.bestRank)
    .map((coin) => `${coin.symbol}#${coin.bestRank}:${coin.excluded!.slice(7)}:${coin.weeks.length}w`);
  console.log(`pegged, once raw top 300 (${review.length}): ${review.join(" ")}`);
  const ruled = [...meta.values()]
    .filter((coin) => coin.excluded === "rule" && coin.bestRank <= 100)
    .sort((a, b) => a.bestRank - b.bestRank)
    .map((coin) => `${coin.symbol}#${coin.bestRank}`);
  console.log(`rule-excluded, once raw top 100 (${ruled.length}): ${ruled.join(" ")}`);

  // Pass 2: adjusted rank and points per CMC id.
  const pointsById = new Map<number, SeriesPoint[]>();
  rowsByWeek.forEach((rows, week) => {
    let adjusted = 0;
    for (const row of rows) {
      if (meta.get(row.id)!.excluded) continue;
      adjusted++;
      const list = pointsById.get(row.id) ?? [];
      list.push({
        week,
        coinId: row.id,
        rankRaw: row.rank,
        rankAdj: adjusted,
        price: row.price,
        marketCap: row.marketCap,
        volume24h: row.volume,
        continuation: false,
      });
      pointsById.set(row.id, list);
    }
  });
  rowsByWeek.length = 0;

  // Lineages, features, outcomes.
  const switchWeek = (day: string) => {
    const index = weekIndex.get(day);
    if (index === undefined) throw new Error(`Lineage switch date ${day} is not a snapshot week`);
    return index;
  };
  const lineages = assembleLineages(pointsById, switchWeek);
  const rootOf = lineageRootOf();
  const btcPrice = refPrice.btc;

  const coinWeeks = columnar([
    "lineage_id", "week", "coin_id", "rank_raw", "rank_adj", "price_usd", "market_cap_usd",
    "volume_24h_usd", "is_continuation", "running_peak_usd", "drawdown", "weeks_since_peak",
    "age_weeks", "ret_52w", "beat_btc_52w", "fell_out_52w", "ret_104w", "beat_btc_104w",
    "fell_out_104w", "reached_top20_104w", "outcome_complete_104w",
  ]);
  const keptLineages = new Set<number>();

  for (const [lineageId, points] of lineages) {
    if (!points.some((p) => !p.continuation && p.rankAdj <= KEEP_RANK)) continue;
    keptLineages.add(lineageId);
    const features = computeFeatures(points, weekDates, meta.get(lineageId)?.dateAdded ?? null);
    const year = computeOutcomes(points, btcPrice, lastWeek, 52);
    const twoYears = computeOutcomes(points, btcPrice, lastWeek, 104);

    points.forEach((point, i) => {
      const f = features[i];
      const values: Record<string, unknown> = {
        lineage_id: lineageId,
        week: weekDates[point.week],
        coin_id: point.coinId,
        rank_raw: point.rankRaw,
        rank_adj: point.rankAdj,
        price_usd: point.price,
        market_cap_usd: round(point.marketCap, 0),
        volume_24h_usd: round(point.volume24h, 0),
        is_continuation: point.continuation,
        running_peak_usd: f ? f.runningPeak : null,
        drawdown: f ? round(f.drawdown, 5) : null,
        weeks_since_peak: f ? f.weeksSincePeak : null,
        age_weeks: f ? f.ageWeeks : null,
        ret_52w: round(year[i].coinReturn, 5),
        beat_btc_52w: year[i].beatBtc,
        fell_out_52w: year[i].fellOut,
        ret_104w: round(twoYears[i].coinReturn, 5),
        beat_btc_104w: twoYears[i].beatBtc,
        fell_out_104w: twoYears[i].fellOut,
        reached_top20_104w: twoYears[i].reachedTop20,
        outcome_complete_104w: twoYears[i].complete && !point.continuation,
      };
      for (const [name, value] of Object.entries(values)) coinWeeks[name].push(value);
    });
  }

  // Coins: every id in a kept lineage, plus everything in the latest snapshot.
  // Names come from today's CMC map where possible (dead coins keep their names).
  const current = new Map<number, MapRow & { status: string }>();
  for (const status of ["untracked", "inactive", "active"]) {
    const map = await readJsonGz<{ data: MapRow[] }>(join(DATA_DIR, "raw", "map", `${status}.json.gz`));
    for (const row of map.data) current.set(row.id, { ...row, status });
  }
  const priceFactor = priceFactorOf();
  const coins = columnar([
    "id", "lineage_id", "name", "symbol", "slug", "status", "date_added", "is_token",
    "excluded_reason", "price_factor", "first_week", "last_week",
  ]);
  for (const coin of meta.values()) {
    const lineageId = rootOf.get(coin.id) ?? coin.id;
    if (!keptLineages.has(lineageId) && coin.lastWeek !== lastWeek) continue;
    const now = current.get(coin.id);
    const values: Record<string, unknown> = {
      id: coin.id,
      lineage_id: lineageId,
      name: now?.name ?? coin.name,
      symbol: now?.symbol ?? coin.symbol,
      slug: now?.slug ?? coin.slug,
      status: now?.status ?? "unknown",
      date_added: coin.dateAdded,
      is_token: coin.isToken,
      excluded_reason: coin.excluded,
      price_factor: priceFactor.get(coin.id) ?? 1,
      first_week: weekDates[coin.firstWeek],
      last_week: weekDates[coin.lastWeek],
    };
    for (const [name, value] of Object.entries(values)) coins[name].push(value);
  }

  // Market weeks: global metrics are stamped Monday 00:00 UTC; map to the Sunday.
  const global = await readJsonGz<{ data: { quotes: GlobalQuote[] } }>(
    join(DATA_DIR, "raw", "global", "weekly.json.gz"),
  );
  const totalCap: number[] = new Array(weekDates.length).fill(0);
  const dominance: (number | null)[] = new Array(weekDates.length).fill(null);
  let matched = 0;
  for (const quote of global.data.quotes) {
    const sunday = new Date(Date.parse(quote.timestamp) - 86_400_000).toISOString().slice(0, 10);
    const week = weekIndex.get(sunday);
    if (week === undefined) continue;
    totalCap[week] = quote.quote.USD.total_market_cap;
    dominance[week] = quote.btc_dominance;
    matched++;
  }
  for (let week = 1; week < totalCap.length; week++) {
    if (!totalCap[week]) totalCap[week] = totalCap[week - 1];
  }
  const phases = marketPhases(totalCap);
  const marketWeeks = columnar([
    "week", "btc_price_usd", "total_market_cap_usd", "btc_dominance", "market_drawdown", "phase", "cycle",
  ]);
  weekDates.forEach((day, week) => {
    const values: Record<string, unknown> = {
      week: day,
      btc_price_usd: btcPrice[week],
      total_market_cap_usd: round(totalCap[week], 0),
      btc_dominance: dominance[week],
      market_drawdown: round(phases[week].drawdown, 5),
      phase: phases[week].phase,
      cycle: cycleOf(day),
    };
    for (const [name, value] of Object.entries(values)) marketWeeks[name].push(value);
  });

  await writeJsonGz(join(PANEL_DIR, "coin_weeks.json.gz"), coinWeeks);
  await writeJsonGz(join(PANEL_DIR, "coins.json.gz"), coins);
  await writeJsonGz(join(PANEL_DIR, "market_weeks.json.gz"), marketWeeks);

  const complete = (coinWeeks.outcome_complete_104w as boolean[]).filter(Boolean).length;
  console.log(
    `lineages ${lineages.size}, kept ${keptLineages.size}, coin_weeks ${coinWeeks.week.length} ` +
      `(${complete} with a complete 2y outcome), coins ${coins.id.length}, ` +
      `BTC price missing in ${btcPrice.filter((p) => p === null).length} weeks, ` +
      `global metrics matched ${matched}/${weekDates.length} weeks`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
