/**
 * Pull the CMC id map for active, inactive and untracked coins, so dead coins
 * keep their names. Most dead coins are "untracked", not "inactive".
 *
 * Output: data/raw/map/{status}.json.gz
 */
import { join } from "node:path";

import { cmcGet } from "@/lib/cmc/client";

import { DATA_DIR, writeJsonGz } from "./lib/raw-store";

const STATUSES = ["active", "inactive", "untracked"] as const;
const PAGE = 5000;

async function pullStatus(status: (typeof STATUSES)[number]) {
  const rows: unknown[] = [];
  let credits = 0;
  for (let start = 1; ; start += PAGE) {
    const { data, receipt } = await cmcGet<unknown[]>(
      "/v1/cryptocurrency/map",
      {
        listing_status: status,
        start,
        limit: PAGE,
        aux: "platform,first_historical_data,last_historical_data,is_active,status",
      },
    );
    rows.push(...data);
    credits += receipt.creditCount ?? 0;
    if (data.length < PAGE) break;
  }
  await writeJsonGz(join(DATA_DIR, "raw", "map", `${status}.json.gz`), {
    status,
    pulledAt: new Date().toISOString(),
    data: rows,
  });
  return { rows: rows.length, credits };
}

async function main() {
  for (const status of STATUSES) {
    const result = await pullStatus(status);
    console.log(`${status}: ${result.rows} coins, ${result.credits} credits`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
