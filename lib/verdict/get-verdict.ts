import "server-only";

import { and, asc, between, desc, eq, gte, ilike, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";
import { coins, coinWeeks, currentState, marketWeeks } from "@/lib/db/schema";

import { addWeeks, analyze, HORIZON_WEEKS, queryBands, twinPath, type OutcomeRow } from "./analyze";
import type { CoinInfo, SearchHit, VerdictResponse } from "./types";

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
};

/** BTC price per snapshot week. */
async function btcPrices(): Promise<Map<string, number>> {
  "use cache";
  cacheLife("days");
  cacheTag("history");
  const rows = await db().select({ week: marketWeeks.week, btc: marketWeeks.btcPriceUsd }).from(marketWeeks);
  return new Map(rows.map((row) => [row.week, row.btc]));
}

/** Resolve a slug to one coin: live coins first, then the most recently seen. */
async function findCoin(slug: string) {
  const [row] = await db()
    .select({ ...coinColumns, live: sql<boolean>`${currentState.coinId} is not null` })
    .from(coins)
    .leftJoin(currentState, eq(currentState.coinId, coins.id))
    .where(eq(coins.slug, slug))
    .orderBy(desc(sql`${currentState.coinId} is not null`), desc(coins.lastWeek))
    .limit(1);
  return row ?? null;
}

export async function getVerdict(slug: string): Promise<VerdictResponse> {
  "use cache";
  cacheLife("days");
  cacheTag("daily");

  const found = await findCoin(slug);
  if (!found) return { status: "not_found", coin: null, message: `No coin with slug "${slug}".` };
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

  const [state] = await db().select().from(currentState).where(eq(currentState.coinId, coin.id));
  if (!state || state.rankAdj > MAX_RANK) {
    return {
      status: "not_covered",
      coin,
      message: state
        ? `${coin.name} is ranked ${state.rankAdj} after removing stablecoins and wrappers. Verdicts cover the top ${MAX_RANK}.`
        : `${coin.name} is not in today's top coins, so there is no current state to match.`,
    };
  }

  const target = { rankAdj: state.rankAdj, drawdown: state.drawdown, ageWeeks: state.ageWeeks };
  const q = queryBands(target);
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
    })
    .from(coinWeeks)
    .where(
      and(
        eq(coinWeeks.outcomeComplete104w, true),
        between(coinWeeks.rankAdj, q.rankMin, q.rankMax),
        between(coinWeeks.drawdown, q.drawdownMin, q.drawdownMax),
        gte(coinWeeks.ageWeeks, q.ageMin),
        q.ageMax === null ? undefined : lt(coinWeeks.ageWeeks, q.ageMax),
        ne(coinWeeks.lineageId, coin.lineageId),
      ),
    );

  const rows: OutcomeRow[] = candidates.map((row) => ({
    ...row,
    drawdown: row.drawdown ?? 0,
    ageWeeks: row.ageWeeks ?? 0,
    ret104w: row.ret104w ?? 0,
    beatBtc104w: row.beatBtc104w ?? false,
    fellOut104w: row.fellOut104w ?? false,
    reachedTop20: row.reachedTop20 ?? false,
  }));

  const ids = [...new Set(rows.map((row) => row.coinId))];
  const [btc, labels] = await Promise.all([
    btcPrices(),
    ids.length
      ? db().select({ id: coins.id, name: coins.name, symbol: coins.symbol }).from(coins).where(inArray(coins.id, ids))
      : Promise.resolve([]),
  ]);
  const names = new Map(labels.map((row) => [row.id, { name: row.name, symbol: row.symbol }]));
  const { twinEpisodes, ...analysis } = analyze(target, coin.lineageId, rows, btc, names);

  const twins = await Promise.all(
    twinEpisodes.map(async (episode) => {
      const path = await db()
        .select({ week: coinWeeks.week, priceUsd: coinWeeks.priceUsd })
        .from(coinWeeks)
        .where(
          and(
            eq(coinWeeks.lineageId, episode.lineageId),
            between(coinWeeks.week, episode.week, addWeeks(episode.week, HORIZON_WEEKS)),
          ),
        )
        .orderBy(asc(coinWeeks.week));
      return { episode, path: twinPath(episode.week, path, btc) };
    }),
  );

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
    twins,
    evidence: {
      historyEndpoint: "/v1/cryptocurrency/listings/historical",
      stateEndpoint:
        state.source === "daily" ? "/v3/cryptocurrency/listings/latest" : "/v1/cryptocurrency/listings/historical",
      stateSnapshot: state.asOf.toISOString(),
      firstWeek: weeks[0],
      lastWeek,
      lastCompleteStart: addWeeks(lastWeek, -HORIZON_WEEKS),
    },
  };
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
    .where(or(eq(sql`lower(${coins.symbol})`, q), ilike(coins.name, prefix), ilike(coins.slug, prefix)))
    .orderBy(
      desc(isNotNull(currentState.coinId)),
      desc(sql`lower(${coins.symbol}) = ${q}`),
      asc(sql`coalesce(${currentState.rankAdj}, 32767)`),
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
