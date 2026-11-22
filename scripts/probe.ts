/**
 * Stage 1 kill test. Answers, with real calls:
 * - Is the key on the Startup plan (history before last year allowed)?
 * - Does listings/historical accept limit=5000, and what does it cost?
 * - Do coins that are dead today appear in old snapshots (no survivorship bias)?
 *
 * Raw responses go to data/probe/ (gitignored). Prints a summary only.
 */
import { join } from "node:path";

import { cmcGet, CmcError, type CmcReceipt } from "@/lib/cmc/client";

import { DATA_DIR, writeJson, writeJsonGz } from "./lib/raw-store";

const PROBE_DIR = join(DATA_DIR, "probe");
const SNAPSHOT_DATES = ["2014-01-05", "2018-01-07", "2022-01-02"] as const;
const AUX =
  "platform,tags,date_added,circulating_supply,total_supply,max_supply,cmc_rank,num_market_pairs";

// Coins known to have died or collapsed, to look for in old snapshots.
const KNOWN_DEAD = [
  { slug: "bitconnect", from: "2018-01-07" },
  { slug: "terra-luna", from: "2022-01-02" },
  { slug: "ftx-token", from: "2022-01-02" },
  { slug: "auroracoin", from: "2014-01-05" },
];

interface MapRow {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  is_active?: number;
}

interface ListingRow {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmc_rank: number;
  date_added?: string;
  tags?: string[];
  platform?: unknown;
  quote?: { USD?: { price?: number; market_cap?: number } };
  [key: string]: unknown;
}

const receipts: CmcReceipt[] = [];

async function call<T>(
  endpoint: string,
  params: Record<string, string | number>,
) {
  try {
    const result = await cmcGet<T>(endpoint, params);
    receipts.push(result.receipt);
    return result;
  } catch (error) {
    if (error instanceof CmcError) receipts.push(error.receipt);
    throw error;
  }
}

async function pullInactiveMap(): Promise<MapRow[]> {
  const rows: MapRow[] = [];
  for (let start = 1; start < 200_000; start += 5000) {
    const { data, body } = await call<MapRow[]>("/v1/cryptocurrency/map", {
      listing_status: "inactive",
      start,
      limit: 5000,
    });
    await writeJsonGz(join(PROBE_DIR, `map-inactive-${start}.json.gz`), body);
    rows.push(...data);
    if (data.length < 5000) break;
  }
  return rows;
}

async function main() {
  const summary: Record<string, unknown> = { ranAt: new Date().toISOString() };

  // 1. Plan and usage
  const keyInfo = await call<{
    plan?: Record<string, unknown>;
    usage?: Record<string, unknown>;
  }>("/v1/key/info", {});
  summary.plan = keyInfo.data.plan;
  summary.usageBefore = keyInfo.data.usage;

  // 2. Coins inactive today
  const inactive = await pullInactiveMap();
  const inactiveIds = new Set(inactive.map((row) => row.id));
  summary.inactiveCount = inactive.length;

  // 3. Old snapshots
  const snapshots: Record<string, unknown>[] = [];
  for (const date of SNAPSHOT_DATES) {
    const entry: Record<string, unknown> = { date };
    try {
      const { data, body, receipt } = await call<ListingRow[]>(
        "/v1/cryptocurrency/listings/historical",
        { date, limit: 5000, convert: "USD", aux: AUX },
      );
      await writeJsonGz(join(PROBE_DIR, `listings-${date}.json.gz`), body);

      const slugs = new Set(data.map((row) => row.slug));
      const deadInSnapshot = data.filter((row) => inactiveIds.has(row.id));
      const status =
        (body as { status?: Record<string, unknown> }).status ?? {};

      entry.rows = data.length;
      entry.creditCount = receipt.creditCount;
      entry.statusKeys = Object.keys(status);
      entry.totalCount = status.total_count ?? null;
      entry.rowKeys = data[0] ? Object.keys(data[0]) : [];
      entry.top3 = data.slice(0, 3).map((row) => ({
        rank: row.cmc_rank,
        symbol: row.symbol,
        price: row.quote?.USD?.price,
      }));
      entry.inactiveTodayPresent = deadInSnapshot.length;
      entry.inactiveTodaySample = deadInSnapshot.slice(0, 10).map((row) => ({
        symbol: row.symbol,
        slug: row.slug,
        rank: row.cmc_rank,
      }));
      entry.knownDead = KNOWN_DEAD.filter((coin) => coin.from <= date).map(
        (coin) => ({
          slug: coin.slug,
          present: slugs.has(coin.slug),
        }),
      );
      entry.withDateAdded = data.filter((row) => row.date_added).length;
      entry.withTags = data.filter((row) => row.tags?.length).length;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    }
    snapshots.push(entry);
  }
  summary.snapshots = snapshots;

  // 4. Usage after, to measure the real cost
  const keyInfoAfter = await call<{ usage?: Record<string, unknown> }>(
    "/v1/key/info",
    {},
  );
  summary.usageAfter = keyInfoAfter.data.usage;
  summary.receipts = receipts;

  await writeJson(join(PROBE_DIR, "summary.json"), summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
