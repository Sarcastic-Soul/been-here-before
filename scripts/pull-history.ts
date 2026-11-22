/**
 * Pull one listings/historical snapshot (top 5000) for every Sunday since
 * CMC history starts. Resumable: weeks already saved are skipped.
 *
 * Output: data/raw/listings/YYYY-MM-DD.json.gz plus data/raw/pull-log.jsonl.
 * Usage: pnpm data:pull [--from 2013-04-28] [--to 2026-11-15]
 */
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { cmcGet, CmcError } from "@/lib/cmc/client";

import { formatDay, sundayOnOrBefore, sundaysBetween } from "./lib/dates";
import { DATA_DIR, exists, writeJsonGz } from "./lib/raw-store";

export const LISTINGS_DIR = join(DATA_DIR, "raw", "listings");
const LOG_PATH = join(DATA_DIR, "raw", "pull-log.jsonl");
const FIRST_SNAPSHOT = "2013-04-28";
const LIMIT = 5000;
const CONCURRENCY = 4;
const AUX =
  "platform,tags,date_added,circulating_supply,total_supply,max_supply,cmc_rank,num_market_pairs";

async function pullWeek(
  date: string,
): Promise<{ rows: number; credits: number }> {
  const { data, body, receipt } = await cmcGet<unknown[]>(
    "/v1/cryptocurrency/listings/historical",
    {
      date,
      limit: LIMIT,
      convert: "USD",
      aux: AUX,
    },
  );
  if (!Array.isArray(data)) throw new Error(`No rows in snapshot ${date}`);
  await writeJsonGz(join(LISTINGS_DIR, `${date}.json.gz`), body);
  const credits = receipt.creditCount ?? 0;
  await appendFile(
    LOG_PATH,
    JSON.stringify({
      date,
      rows: data.length,
      credits,
      fetchedAt: receipt.fetchedAt,
    }) + "\n",
  );
  return { rows: data.length, credits };
}

async function main() {
  const { values } = parseArgs({
    options: { from: { type: "string" }, to: { type: "string" } },
  });
  // Today's snapshot may not be complete yet, so stop at last week's Sunday.
  const lastFull = formatDay(
    sundayOnOrBefore(new Date(Date.now() - 86_400_000)),
  );
  const weeks = sundaysBetween(
    values.from ?? FIRST_SNAPSHOT,
    values.to ?? lastFull,
  );

  await mkdir(LISTINGS_DIR, { recursive: true });
  const todo: string[] = [];
  for (const week of weeks) {
    if (!(await exists(join(LISTINGS_DIR, `${week}.json.gz`)))) todo.push(week);
  }
  console.log(
    `${weeks.length} weeks, ${weeks.length - todo.length} saved, ${todo.length} to pull`,
  );

  let done = 0;
  let credits = 0;
  const failures: string[] = [];
  const queue = [...todo];

  async function worker() {
    for (let week = queue.shift(); week; week = queue.shift()) {
      try {
        const result = await pullWeek(week);
        credits += result.credits;
        done++;
        if (done % 25 === 0 || done === todo.length) {
          console.log(
            `${done}/${todo.length} pulled, last ${week} (${result.rows} rows), ${credits} credits`,
          );
        }
      } catch (error) {
        failures.push(week);
        const message =
          error instanceof CmcError ? error.message : String(error);
        console.error(`FAILED ${week}: ${message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(
    `Done. ${done} pulled, ${credits} credits, ${failures.length} failed`,
  );
  if (failures.length) {
    console.log(`Failed weeks (re-run to retry): ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
