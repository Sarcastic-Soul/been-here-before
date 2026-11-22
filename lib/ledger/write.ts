import "server-only";

import { desc } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { ledgerDays, ledgerEntries } from "@/lib/db/schema";
import type { VerdictOk } from "@/lib/verdict/types";

import { chainRoot, entriesHash, toLine } from "./chain";

export type LedgerResult =
  | { written: true; day: string; count: number; root: string }
  | { written: false; day: string | null; reason: string };

/**
 * Writes one ledger day from today's verdicts. The day is the date of the
 * CoinMarketCap state the verdicts used, so a second run on the same data (a
 * deploy prewarm, a retry) finds the day already written and does nothing.
 * Days only go forward: a day at or before the latest one is never written.
 */
export async function recordLedger(
  verdicts: readonly VerdictOk[],
): Promise<LedgerResult> {
  if (verdicts.length === 0)
    return { written: false, day: null, reason: "no verdicts" };
  const day = verdicts
    .map((v) => v.state.asOf.slice(0, 10))
    .reduce((a, b) => (a > b ? a : b));
  const today = verdicts.filter((v) => v.state.asOf.slice(0, 10) === day);

  const [latest] = await db()
    .select({ day: ledgerDays.day, root: ledgerDays.root })
    .from(ledgerDays)
    .orderBy(desc(ledgerDays.day))
    .limit(1);
  if (latest && latest.day >= day)
    return { written: false, day, reason: "already written" };

  const bySlug = new Map(today.map((v) => [v.coin.slug, v]));
  const rows = [...bySlug.values()].map((v) => ({
    day,
    slug: v.coin.slug,
    coinId: v.coin.id,
    verdict: v.verdict,
    line: toLine(v, day),
  }));
  const hash = await entriesHash(rows.map((row) => row.line));
  const prevRoot = latest?.root ?? null;
  const root = await chainRoot(prevRoot, day, hash);

  // One transaction: the day row and its entries land together or not at all.
  await db().batch([
    db().insert(ledgerEntries).values(rows),
    db()
      .insert(ledgerDays)
      .values({ day, count: rows.length, entriesHash: hash, prevRoot, root }),
  ]);
  return { written: true, day, count: rows.length, root };
}
