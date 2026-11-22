/**
 * Pull weekly global market metrics (total market cap, BTC dominance) since
 * 2013, used for market phase. Output: data/raw/global/weekly.json.gz
 */
import { join } from "node:path";

import { cmcGet } from "@/lib/cmc/client";

import { DATA_DIR, writeJsonGz } from "./lib/raw-store";

async function main() {
  const { data, body, receipt } = await cmcGet<{ quotes?: unknown[] }>(
    "/v1/global-metrics/quotes/historical",
    {
      time_start: "2013-04-28",
      time_end: new Date().toISOString().slice(0, 10),
      interval: "weekly",
      count: 1000,
      convert: "USD",
    },
  );
  await writeJsonGz(join(DATA_DIR, "raw", "global", "weekly.json.gz"), body);
  console.log(
    `global metrics: ${data.quotes?.length ?? 0} points, ${receipt.creditCount} credits`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
