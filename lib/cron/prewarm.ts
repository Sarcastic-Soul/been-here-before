import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { asc, eq, isNull } from "drizzle-orm";

import { getCalibration } from "@/lib/calibration/get-calibration";
import { db } from "@/lib/db/client";
import { recordLedger, type LedgerResult } from "@/lib/ledger/write";
import { coins, currentState } from "@/lib/db/schema";
import { getBenchmark } from "@/lib/verdict/get-benchmark";
import { getReceipt } from "@/lib/verdict/get-receipt";
import { getPanelStats } from "@/lib/verdict/get-stats";
import { getSlugIndex, getVerdict } from "@/lib/verdict/get-verdict";
import type { VerdictOk } from "@/lib/verdict/types";

/** How many of today's top coins (after removing stablecoins and wrappers) to warm. */
export const PREWARM_TOP = 100;
/** Coins the home page links to, warmed even if they drop out of the top. */
const ALWAYS = ["filecoin"];
const CONCURRENCY = 4;

async function savedSlugs(): Promise<string[]> {
  try {
    const file = path.join(
      process.cwd(),
      "public",
      "precomputed",
      "index.json",
    );
    const index = JSON.parse(await readFile(file, "utf8")) as {
      coins: { slug: string }[];
    };
    return index.coins.map((coin) => coin.slug);
  } catch {
    return [];
  }
}

/** Today's top coins, the saved-copy coins and the home page example. */
export async function prewarmSlugs(): Promise<string[]> {
  const [top, saved] = await Promise.all([
    db()
      .select({ slug: coins.slug })
      .from(currentState)
      .innerJoin(coins, eq(coins.id, currentState.coinId))
      .where(isNull(coins.excludedReason))
      .orderBy(asc(currentState.rankAdj))
      .limit(PREWARM_TOP),
    savedSlugs(),
  ]);
  return [...new Set([...ALWAYS, ...top.map((row) => row.slug), ...saved])];
}

/**
 * Fills the shared cache for the pages most people open: the home page
 * numbers and the top coins' verdicts and receipts. Calls the same cached
 * functions with the same arguments as the pages, so the cache keys match.
 * Then writes the day's verdicts for the top coins to the prediction ledger.
 */
export async function prewarm(): Promise<{
  warmed: number;
  failed: string[];
  ledger: LedgerResult;
  ms: number;
}> {
  const start = Date.now();
  await Promise.all([
    getPanelStats(),
    getCalibration(),
    getSlugIndex(),
    getBenchmark(),
  ]);
  const slugs = await prewarmSlugs();
  const top: VerdictOk[] = [];
  async function warm(slug: string) {
    const verdict = await getVerdict(slug);
    if (verdict.status !== "ok") return;
    if (verdict.state.rankAdj <= PREWARM_TOP) top.push(verdict);
    await getReceipt(verdict.coin.id);
  }
  const firstTry: string[] = [];
  let next = 0;
  async function worker() {
    while (next < slugs.length) {
      const slug = slugs[next++];
      await warm(slug).catch(() => firstTry.push(slug));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  // One slower retry for anything that failed, often a cold database.
  const failed: string[] = [];
  for (const slug of firstTry) {
    try {
      await warm(slug);
    } catch (error) {
      console.error(`prewarm ${slug} failed`, error);
      failed.push(slug);
    }
  }
  // A partial day would look like coins were left out on purpose: skip it.
  const ledger: LedgerResult =
    failed.length > 0
      ? { written: false, day: null, reason: `${failed.length} coins failed` }
      : await recordLedger(top).catch((error: unknown) => {
          console.error("ledger write failed", error);
          return { written: false, day: null, reason: "write failed" };
        });
  return {
    warmed: slugs.length - failed.length,
    failed,
    ledger,
    ms: Date.now() - start,
  };
}
