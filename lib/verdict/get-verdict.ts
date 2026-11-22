import "server-only";

import {
  and,
  asc,
  between,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";
import { coins, coinWeeks, currentState, marketWeeks } from "@/lib/db/schema";
import { phaseToday, type Phase } from "@/lib/engine/cycles";
import { BAND_STEPS, type BandStep, type MatchState } from "@/lib/engine/match";
import { MIN_EPISODES } from "@/lib/engine/verdict";
import { monthYear } from "@/lib/format";

import {
  addWeeks,
  analyze,
  episodeCount,
  HORIZON_WEEKS,
  queryBands,
  twinPath,
  type OutcomeRow,
} from "./analyze";
import type {
  CoinInfo,
  MarketToday,
  SearchHit,
  VerdictResponse,
} from "./types";

/** Verdicts cover adjusted ranks 1 to 1000 (see the method page). */
export const MAX_RANK = 1000;
const BTC_ID = 1;

const coinColumns = {
  id: coins.id,
  lineageId: coins.lineageId,
  name: coins.name,
  symbol: coins.symbol,
  slug: coins.slug,
  status: coins.status,
  dateAdded: coins.dateAdded,
  excludedReason: coins.excludedReason,
  lastWeek: coins.lastWeek,
};

/** BTC price per snapshot week. */
export async function btcPrices(): Promise<Map<string, number>> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("history");
  const rows = await db()
    .select({ week: marketWeeks.week, btc: marketWeeks.btcPriceUsd })
    .from(marketWeeks);
  return new Map(rows.map((row) => [row.week, row.btc]));
}

/** The whole market per snapshot week, its phase alone, and the latest week. */
export async function marketInfo(): Promise<{
  byWeek: Map<string, MarketToday>;
  phases: Map<string, Phase>;
  latest: MarketToday | null;
}> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("history");
  const rows = await db()
    .select({
      week: marketWeeks.week,
      phase: marketWeeks.phase,
      btcDominance: marketWeeks.btcDominance,
      marketDrawdown: marketWeeks.marketDrawdown,
    })
    .from(marketWeeks)
    .orderBy(asc(marketWeeks.week));
  // market_weeks stores dominance in percent; the API uses 0 to 1.
  const markets: MarketToday[] = rows.map((row) => ({
    ...row,
    phase: row.phase as Phase,
    btcDominance: row.btcDominance === null ? null : row.btcDominance / 100,
  }));
  return {
    byWeek: new Map(markets.map((m) => [m.week, m])),
    phases: new Map(markets.map((m) => [m.week, m.phase])),
    latest: markets.at(-1) ?? null,
  };
}

/**
 * Today's whole market from the cron's daily global-metrics call, measured
 * against the weekly history with the same phase rule. Null before the first
 * call; the page then shows the last weekly snapshot instead.
 */
export async function marketNow(): Promise<MarketToday | null> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("daily");
  const result = await db().execute<{
    fetched_at: string;
    cap: number | string | null;
    dominance: number | string | null;
  }>(sql`
    SELECT fetched_at,
      (body->'data'->'quote'->'USD'->>'total_market_cap')::float8 AS cap,
      (body->'data'->>'btc_dominance')::float8 AS dominance
    FROM cmc_receipts
    WHERE kind = 'global_metrics_latest'`);
  const row = result.rows[0];
  const cap =
    row?.cap === null || row?.cap === undefined ? NaN : Number(row.cap);
  if (!row || !(cap > 0)) return null;
  const weekly = await db()
    .select({ week: marketWeeks.week, cap: marketWeeks.totalMarketCapUsd })
    .from(marketWeeks);
  const fetchedAt = new Date(row.fetched_at).toISOString();
  const day = fetchedAt.slice(0, 10);
  const { drawdown, phase } = phaseToday(weekly, { day, cap });
  return {
    week: day,
    phase,
    marketDrawdown: drawdown,
    // CMC gives dominance in percent; the API uses 0 to 1.
    btcDominance: row.dominance === null ? null : Number(row.dominance) / 100,
    fetchedAt,
  };
}

/** Rows with a finished 2-year outcome inside one step's bands (SQL prefilter). */
async function candidateRows(
  target: MatchState,
  lineageId: number,
  step: BandStep,
  maxWeek: string | null,
): Promise<OutcomeRow[]> {
  const q = queryBands(target, step);
  const candidates = await db()
    .select({
      lineageId: coinWeeks.lineageId,
      coinId: coinWeeks.coinId,
      week: coinWeeks.week,
      rankAdj: coinWeeks.rankAdj,
      drawdown: coinWeeks.drawdown,
      ageWeeks: coinWeeks.ageWeeks,
      ret104w: coinWeeks.ret104w,
      beatBtc104w: coinWeeks.beatBtc104w,
      beatBtc52w: coinWeeks.beatBtc52w,
      fellOut104w: coinWeeks.fellOut104w,
      reachedTop20: coinWeeks.reachedTop20_104w,
      weeksSincePeak: coinWeeks.weeksSincePeak,
      volume24hUsd: coinWeeks.volume24hUsd,
      marketCapUsd: coinWeeks.marketCapUsd,
    })
    .from(coinWeeks)
    .where(
      and(
        eq(coinWeeks.outcomeComplete104w, true),
        between(coinWeeks.rankAdj, q.rankMin, q.rankMax),
        between(coinWeeks.drawdown, q.drawdownMin, q.drawdownMax),
        gte(coinWeeks.ageWeeks, q.ageMin),
        q.ageMax === null ? undefined : lt(coinWeeks.ageWeeks, q.ageMax),
        ne(coinWeeks.lineageId, lineageId),
        maxWeek === null ? undefined : lte(coinWeeks.week, maxWeek),
      ),
    );
  return candidates.map(({ volume24hUsd, marketCapUsd, ...row }) => ({
    ...row,
    turnover:
      volume24hUsd !== null && marketCapUsd !== null && marketCapUsd > 0
        ? volume24hUsd / marketCapUsd
        : null,
    weeksSincePeak: row.weeksSincePeak ?? undefined,
    drawdown: row.drawdown ?? 0,
    ageWeeks: row.ageWeeks ?? 0,
    ret104w: row.ret104w ?? 0,
    beatBtc104w: row.beatBtc104w ?? false,
    fellOut104w: row.fellOut104w ?? false,
    reachedTop20: row.reachedTop20 ?? false,
  }));
}

/** Resolve a slug to one coin: live coins first, then the most recently seen. */
export async function findCoin(slug: string) {
  const [row] = await db()
    .select({
      ...coinColumns,
      live: sql<boolean>`${currentState.coinId} is not null`,
    })
    .from(coins)
    .leftJoin(currentState, eq(currentState.coinId, coins.id))
    .where(eq(coins.slug, slug))
    .orderBy(
      desc(sql`${currentState.coinId} is not null`),
      desc(coins.lastWeek),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Match one coin's state against past episodes, widening in fixed steps while
 * n is under the minimum, and build the analysis and twin paths.
 * maxWeek limits episodes to those that started on or before it (the time
 * machine passes T minus 106 weeks so every outcome was known at T).
 * survivors: also count which lineages are alive today (only for today's verdict).
 */
export async function matchCoin(
  lineageId: number,
  target: MatchState,
  options: { maxWeek: string | null; survivors: boolean },
) {
  // Standard bands first; widen in fixed steps only while n is under the
  // minimum. If even the widest step is short, it is still used so the page
  // can show the closest twins next to the refusal.
  let rows: OutcomeRow[] = [];
  let stepIndex = 0;
  const tried: number[] = [];
  for (; stepIndex < BAND_STEPS.length; stepIndex++) {
    rows = await candidateRows(
      target,
      lineageId,
      BAND_STEPS[stepIndex],
      options.maxWeek,
    );
    const n = episodeCount(rows, target, lineageId, stepIndex);
    tried.push(n);
    if (n >= MIN_EPISODES) break;
  }
  stepIndex = Math.min(stepIndex, BAND_STEPS.length - 1);

  const ids = [...new Set(rows.map((row) => row.coinId))];
  const lineages = [...new Set(rows.map((row) => row.lineageId))];
  const [btc, market, labels, survivors] = await Promise.all([
    btcPrices(),
    marketInfo(),
    ids.length
      ? db()
          .select({ id: coins.id, name: coins.name, symbol: coins.symbol })
          .from(coins)
          .where(inArray(coins.id, ids))
      : Promise.resolve([]),
    // A lineage is alive if any of its coins is in the latest weekly snapshot.
    options.survivors && lineages.length
      ? db()
          .selectDistinct({ lineageId: coins.lineageId })
          .from(coins)
          .where(
            and(
              inArray(coins.lineageId, lineages),
              eq(
                coins.lastWeek,
                sql<string>`(select max(${marketWeeks.week}) from ${marketWeeks})`,
              ),
            ),
          )
      : Promise.resolve([]),
  ]);
  const names = new Map(
    labels.map((row) => [row.id, { name: row.name, symbol: row.symbol }]),
  );
  const { twinEpisodes, ...analysis } = analyze(
    target,
    lineageId,
    rows,
    btc,
    names,
    {
      stepIndex,
      tried,
      alive: options.survivors
        ? new Set(survivors.map((row) => row.lineageId))
        : undefined,
      phases: market.phases,
    },
  );

  const twins = await Promise.all(
    twinEpisodes.map(async (episode) => {
      const path = await db()
        .select({ week: coinWeeks.week, priceUsd: coinWeeks.priceUsd })
        .from(coinWeeks)
        .where(
          and(
            eq(coinWeeks.lineageId, episode.lineageId),
            between(
              coinWeeks.week,
              episode.week,
              addWeeks(episode.week, HORIZON_WEEKS),
            ),
          ),
        )
        .orderBy(asc(coinWeeks.week));
      return { episode, path: twinPath(episode.week, path, btc) };
    }),
  );

  return { analysis, twins, btc, market };
}

/**
 * The verdict for one coin. Cached in the shared remote cache (Vercel Runtime
 * Cache), not per serverless instance, so a page view rarely touches the
 * database. The daily cron expires the "daily" tag and /api/cron/prewarm fills
 * the top coins again.
 */
export async function getVerdict(slug: string): Promise<VerdictResponse> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("daily");

  const found = await findCoin(slug);
  if (!found)
    return {
      status: "not_found",
      coin: null,
      message: `No coin with slug "${slug}".`,
    };
  const coin: CoinInfo = {
    id: found.id,
    lineageId: found.lineageId,
    name: found.name,
    symbol: found.symbol,
    slug: found.slug,
    status: found.status,
    dateAdded: found.dateAdded,
  };

  if (found.excludedReason) {
    return {
      status: "excluded",
      coin,
      message: `${coin.name} tracks another asset (a stablecoin, wrapped or staked token), so its rank says nothing about its own fate. It is left out of the ranking.`,
    };
  }
  if (coin.id === BTC_ID) {
    return {
      status: "benchmark",
      coin,
      message: "Bitcoin is the benchmark every other coin is measured against.",
    };
  }

  const [state] = await db()
    .select()
    .from(currentState)
    .where(eq(currentState.coinId, coin.id));
  if (!state) {
    // A migrated coin (MATIC to POL): send the visitor to the live coin of
    // the same lineage instead of a dead end.
    const [live] = await db()
      .select({ slug: coins.slug, name: coins.name })
      .from(coins)
      .innerJoin(currentState, eq(currentState.coinId, coins.id))
      .where(and(eq(coins.lineageId, coin.lineageId), ne(coins.id, coin.id)))
      .orderBy(asc(currentState.rankAdj))
      .limit(1);
    if (live)
      return {
        status: "moved",
        coin,
        movedTo: live,
        message: `${coin.name} moved to ${live.name}. Its history counts as one coin.`,
      };
    return {
      status: "not_covered",
      coin,
      lastSeen: found.lastWeek,
      message: `${coin.name} was last seen in the weekly top 5,000 in ${monthYear(found.lastWeek)}, so it has no spot today to match. Its history still counts in other coins' results: a coin that fell out within 2 years counts as a total loss.`,
    };
  }
  if (state.rankAdj > MAX_RANK) {
    return {
      status: "not_covered",
      coin,
      message: `${coin.name} is ranked ${state.rankAdj} after removing stablecoins and wrappers. Verdicts cover the top ${MAX_RANK}.`,
    };
  }

  const target = {
    rankAdj: state.rankAdj,
    drawdown: state.drawdown,
    ageWeeks: state.ageWeeks,
  };
  const [{ analysis, twins, btc, market }, today] = await Promise.all([
    matchCoin(coin.lineageId, target, { maxWeek: null, survivors: true }),
    marketNow().catch((error: unknown) => {
      console.error("today's market failed", error);
      return null;
    }),
  ]);
  const marketShown = today ?? market.latest;

  const weeks = [...btc.keys()].sort();
  const lastWeek = weeks[weeks.length - 1];

  return {
    status: "ok",
    coin,
    state: {
      asOf: state.asOf.toISOString(),
      source: state.source === "daily" ? "daily" : "weekly",
      rankAdj: state.rankAdj,
      rankRaw: state.rankRaw,
      priceUsd: state.priceUsd,
      marketCapUsd: state.marketCapUsd,
      drawdown: state.drawdown,
      weeksSincePeak: state.weeksSincePeak,
      ageWeeks: state.ageWeeks,
    },
    ...analysis,
    ...(marketShown ? { market: marketShown } : {}),
    twins,
    evidence: {
      historyEndpoint: "/v1/cryptocurrency/listings/historical",
      stateEndpoint:
        state.source === "daily"
          ? "/v1/cryptocurrency/listings/latest"
          : "/v1/cryptocurrency/listings/historical",
      stateSnapshot: state.asOf.toISOString(),
      firstWeek: weeks[0],
      lastWeek,
      lastCompleteStart: addWeeks(lastWeek, -HORIZON_WEEKS),
    },
  };
}

/**
 * Every known slug, and today's best-ranked live coin per lowercase symbol.
 * Lets a page reject unknown slugs before anything is cached for them, and
 * send /coin/btc or /coin/sol to the right coin.
 */
export async function getSlugIndex(): Promise<{
  slugs: Set<string>;
  symbols: Map<string, { slug: string; name: string }>;
}> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("daily");

  const [all, live] = await Promise.all([
    db().select({ slug: coins.slug }).from(coins),
    db()
      .select({ symbol: coins.symbol, slug: coins.slug, name: coins.name })
      .from(currentState)
      .innerJoin(coins, eq(coins.id, currentState.coinId))
      .where(isNull(coins.excludedReason))
      .orderBy(asc(currentState.rankAdj)),
  ]);
  const symbols = new Map<string, { slug: string; name: string }>();
  for (const row of live) {
    const key = row.symbol.toLowerCase();
    if (!symbols.has(key)) symbols.set(key, { slug: row.slug, name: row.name });
  }
  return { slugs: new Set(all.map((row) => row.slug)), symbols };
}

/** Coin search by symbol, name or slug. Live coins first, then by rank. */
export async function searchCoins(query: string): Promise<SearchHit[]> {
  "use cache";
  cacheLife("days");
  cacheTag("daily");

  const q = query.trim().toLowerCase();
  if (!q) return [];
  const prefix = `${q.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await db()
    .select({
      id: coins.id,
      name: coins.name,
      symbol: coins.symbol,
      slug: coins.slug,
      rankAdj: currentState.rankAdj,
      excludedReason: coins.excludedReason,
    })
    .from(coins)
    .leftJoin(currentState, eq(currentState.coinId, coins.id))
    .where(
      or(
        eq(sql`lower(${coins.symbol})`, q),
        ilike(coins.name, prefix),
        ilike(coins.slug, prefix),
      ),
    )
    .orderBy(
      desc(isNotNull(currentState.coinId)),
      // One letter is too short for an exact symbol to mean much ("b" is a
      // rank-152 coin), so short queries go by rank alone.
      ...(q.length >= 2 ? [desc(sql`lower(${coins.symbol}) = ${q}`)] : []),
      asc(sql`coalesce(${currentState.rankAdj}, 32767)`),
      // Among coins that are gone, the ones that lasted longest come first.
      desc(sql`${coins.lastWeek} - ${coins.firstWeek}`),
      desc(coins.lastWeek),
    )
    .limit(10);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    slug: row.slug,
    rankAdj: row.rankAdj,
    live: row.rankAdj !== null,
    excluded: row.excludedReason !== null,
  }));
}

/** For /api/health: the database answers and the data is fresh. */
export async function healthCheck() {
  const [row] = await db()
    .select({
      lastWeek: sql<string>`(select max(${marketWeeks.week}) from ${marketWeeks})`,
      stateAsOf: sql<string>`(select max(${currentState.asOf}) from ${currentState})`,
      liveCoins: sql<number>`(select count(*)::int from ${currentState})`,
    })
    .from(sql`(select 1) as one`);
  return row;
}
