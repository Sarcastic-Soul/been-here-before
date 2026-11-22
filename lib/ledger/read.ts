import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";
import { ledgerDays, ledgerEntries } from "@/lib/db/schema";

import type { LedgerDay } from "./chain";

export const LEDGER_TAG = "ledger";

/** Every ledger day, newest first. */
export async function getLedgerDays(): Promise<LedgerDay[]> {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(LEDGER_TAG);
  return db()
    .select({
      day: ledgerDays.day,
      count: ledgerDays.count,
      entriesHash: ledgerDays.entriesHash,
      prevRoot: ledgerDays.prevRoot,
      root: ledgerDays.root,
    })
    .from(ledgerDays)
    .orderBy(desc(ledgerDays.day));
}

/** One day with its exact hashed lines, sorted by slug. Null if not written. */
export async function getLedgerDay(
  day: string,
): Promise<(LedgerDay & { lines: string[] }) | null> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(LEDGER_TAG);
  const [head] = await db()
    .select({
      day: ledgerDays.day,
      count: ledgerDays.count,
      entriesHash: ledgerDays.entriesHash,
      prevRoot: ledgerDays.prevRoot,
      root: ledgerDays.root,
    })
    .from(ledgerDays)
    .where(eq(ledgerDays.day, day))
    .limit(1);
  if (!head) return null;
  const rows = await db()
    .select({ line: ledgerEntries.line })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.day, day))
    .orderBy(asc(ledgerEntries.slug));
  return { ...head, lines: rows.map((row) => row.line) };
}
