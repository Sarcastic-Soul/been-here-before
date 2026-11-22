import "server-only";

import { and, asc, between, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";
import { coinWeeks } from "@/lib/db/schema";
import { longDate } from "@/lib/format";

import { addWeeks, HORIZON_WEEKS, twinPath } from "./analyze";

export { snapToSunday } from "./analyze";
import {
  btcPrices,
  findCoin,
  marketInfo,
  matchCoin,
  MAX_RANK,
} from "./get-verdict";
import type { CoinInfo, MarketToday, TwinPoint, VerdictOk } from "./types";

/**
 * An episode is only used at T if its 2-year outcome was known by T. Same
 * rule as scripts/calibrate.ts: 104 weeks plus 2 weeks of slack.
 */
export const CLOSED_AFTER_WEEKS = HORIZON_WEEKS + 2;

const BTC_ID = 1;

/** What really happened to the coin over the 2 years after T. */
export interface ActualOutcome {
  /** False when T is less than 2 years ago: the path stops at today. */
  complete: boolean;
  ret104w: number | null;
  btcRet104w: number | null;
  beatBtc104w: boolean | null;
  fellOut104w: boolean | null;
  reachedTop20: boolean | null;
  path: TwinPoint[];
}

export interface PastOk {
  status: "ok";
  /** The snapshot week T the verdict is replayed at. */
  asOf: string;
  /** The latest episode start allowed at T. */
  cutoff: string;
  /** Same shape as today's verdict, with the state and history as of T. */
  verdict: VerdictOk;
  actual: ActualOutcome;
  /** The whole market in week T. */
  market: MarketToday | null;
}

export interface PastRefused {
  status:
    | "not_found"
    | "excluded"
    | "benchmark"
    | "not_listed"
    | "not_covered"
    | "out_of_range";
  coin: CoinInfo | null;
  message: string;
}

export type PastResponse = PastOk | PastRefused;

function noHindsight<T extends { aliveToday?: boolean }>(row: T): T {
  const copy = { ...row };
  delete copy.aliveToday;
  return copy;
}


/**
 * The verdict the site would have given for a coin in week T, using only
 * episodes whose 2-year outcome was known by then, next to what really
 * happened. Nothing after T feeds the verdict; only the "what happened" part
 * reads later weeks.
 */
export async function getPastVerdict(
  slug: string,
  week: string,
): Promise<PastResponse> {
  "use cache: remote";
  cacheLife("weeks");
  cacheTag("history");

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
  if (found.excludedReason)
    return {
      status: "excluded",
      coin,
      message: `${coin.name} tracks another asset (a stablecoin, wrapped or staked token), so it is left out of the ranking.`,
    };
  if (coin.id === BTC_ID)
    return {
      status: "benchmark",
      coin,
      message: "Bitcoin is the benchmark every other coin is measured against.",
    };

  const [btc, market] = await Promise.all([btcPrices(), marketInfo()]);
  const weeks = [...btc.keys()].sort();
  const firstWeek = weeks[0];
  const lastWeek = weeks[weeks.length - 1];
  const cutoff = addWeeks(week, -CLOSED_AFTER_WEEKS);
  if (!btc.has(week) || cutoff < firstWeek)
    return {
      status: "out_of_range",
      coin,
      message: `Pick a Sunday from ${longDate(addWeeks(firstWeek, CLOSED_AFTER_WEEKS))} to ${longDate(lastWeek)}. Earlier weeks have no finished 2-year history to compare against.`,
    };

  const [row] = await db()
    .select()
    .from(coinWeeks)
    .where(
      and(eq(coinWeeks.lineageId, coin.lineageId), eq(coinWeeks.week, week)),
    );
  if (!row || row.drawdown === null || row.ageWeeks === null)
    return {
      status: "not_listed",
      coin,
      message: `${coin.name} was not in the weekly top 5,000 in the week of ${longDate(week)}.`,
    };
  if (row.rankAdj > MAX_RANK)
    return {
      status: "not_covered",
      coin,
      message: `${coin.name} was ranked ${row.rankAdj} that week after removing stablecoins and wrappers. Verdicts cover the top ${MAX_RANK}.`,
    };

  const target = {
    rankAdj: row.rankAdj,
    drawdown: row.drawdown,
    ageWeeks: row.ageWeeks,
  };
  const [{ analysis, twins }, ownPath] = await Promise.all([
    matchCoin(coin.lineageId, target, { maxWeek: cutoff, survivors: false }),
    db()
      .select({ week: coinWeeks.week, priceUsd: coinWeeks.priceUsd })
      .from(coinWeeks)
      .where(
        and(
          eq(coinWeeks.lineageId, coin.lineageId),
          between(coinWeeks.week, week, addWeeks(week, HORIZON_WEEKS)),
        ),
      )
      .orderBy(asc(coinWeeks.week)),
  ]);

  // Which coins are alive today is hindsight, so the replay leaves it out.
  const rest = { ...analysis, episodes: analysis.episodes.map(noHindsight) };
  delete rest.survivorsOnly;
  const thenMarket = market.byWeek.get(week) ?? null;

  const btcEnd = btc.get(addWeeks(week, HORIZON_WEEKS));
  const btcStart = btc.get(week);
  const complete = row.outcomeComplete104w;

  const verdict: VerdictOk = {
    status: "ok",
    coin,
    state: {
      asOf: `${week}T00:00:00.000Z`,
      source: "weekly",
      rankAdj: row.rankAdj,
      rankRaw: row.rankRaw,
      priceUsd: row.priceUsd,
      marketCapUsd: row.marketCapUsd,
      drawdown: row.drawdown,
      weeksSincePeak: row.weeksSincePeak ?? 0,
      ageWeeks: row.ageWeeks,
    },
    ...rest,
    ...(thenMarket ? { market: thenMarket } : {}),
    twins: twins.map((twin) => ({
      ...twin,
      episode: noHindsight(twin.episode),
    })),
    evidence: {
      historyEndpoint: "/v1/cryptocurrency/listings/historical",
      stateEndpoint: "/v1/cryptocurrency/listings/historical",
      stateSnapshot: `${week}T00:00:00.000Z`,
      firstWeek,
      lastWeek: week,
      lastCompleteStart: cutoff,
    },
  };

  return {
    status: "ok",
    asOf: week,
    cutoff,
    verdict,
    actual: {
      complete,
      ret104w: complete ? row.ret104w : null,
      btcRet104w: complete && btcStart && btcEnd ? btcEnd / btcStart - 1 : null,
      beatBtc104w: complete ? row.beatBtc104w : null,
      fellOut104w: complete ? row.fellOut104w : null,
      reachedTop20: complete ? row.reachedTop20_104w : null,
      path: twinPath(week, ownPath, btc),
    },
    market: thenMarket,
  };
}
