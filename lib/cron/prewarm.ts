import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { asc, eq, isNull } from "drizzle-orm";

import { getCalibration } from "@/lib/calibration/get-calibration";
import { db } from "@/lib/db/client";
import { coins, currentState } from "@/lib/db/schema";
import { getReceipt } from "@/lib/verdict/get-receipt";
import { getPanelStats } from "@/lib/verdict/get-stats";
import { getSlugIndex, getVerdict } from "@/lib/verdict/get-verdict";

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
 */
export async function prewarm(): Promise<{
  warmed: number;
  failed: string[];
  ms: number;
}> {
  const start = Date.now();
  await Promise.all([getPanelStats(), getCalibration(), getSlugIndex()]);
  const slugs = await prewarmSlugs();
  const failed: string[] = [];
  let next = 0;
  async function worker() {
    while (next < slugs.length) {
      const slug = slugs[next++];
      try {
        const verdict = await getVerdict(slug);
        if (verdict.status === "ok") await getReceipt(verdict.coin.id);
      } catch (error) {
        console.error(`prewarm ${slug} failed`, error);
        failed.push(slug);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return {
    warmed: slugs.length - failed.length,
    failed,
    ms: Date.now() - start,
  };
}
