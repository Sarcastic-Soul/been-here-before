import "server-only";

import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";

import type { Receipt } from "./types";

/**
 * The raw listings/latest row behind today's numbers for one coin. Read from the
 * last cron call stored in cmc_receipts; nothing here calls CMC. The request URL
 * never holds the key (it goes in a header).
 */
export async function getReceipt(coinId: number): Promise<Receipt | null> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("daily");

  const result = await db().execute<{
    endpoint: string;
    request_url: string;
    fetched_at: string;
    http_status: number;
    credit_count: number | null;
    status: Record<string, unknown> | null;
    row: Record<string, unknown> | null;
  }>(sql`
    SELECT endpoint, request_url, fetched_at, http_status, credit_count,
      body->'status' AS status,
      (SELECT elem FROM jsonb_array_elements(body->'data') AS elem
        WHERE (elem->>'id')::int = ${coinId} LIMIT 1) AS row
    FROM cmc_receipts
    WHERE kind = 'listings_latest'`);
  const receipt = result.rows[0];
  if (!receipt) return null;
  return {
    endpoint: receipt.endpoint,
    requestUrl: receipt.request_url,
    fetchedAt: new Date(receipt.fetched_at).toISOString(),
    httpStatus: receipt.http_status,
    creditCount: receipt.credit_count,
    status: receipt.status,
    row: receipt.row,
  };
}
