/**
 * Load the panel (data/panel/*.json.gz, from build-panel.ts) into Neon.
 * Replaces coins, coin_weeks and market_weeks in one transaction, then seeds
 * current_state from the last weekly snapshot. Nothing here calls CMC.
 *
 * Usage: pnpm data:build (runs build-panel.ts first)
 */
import { join } from "node:path";

import { Pool } from "@neondatabase/serverless";

import { DATA_DIR, readJsonGz } from "./lib/raw-store";

const PANEL_DIR = join(DATA_DIR, "panel");
const BATCH = 20_000;

type Columns = Record<string, unknown[]>;

/** Postgres array type per column; the column order is the insert order. */
const TABLES: { table: string; file: string; types: Record<string, string> }[] = [
  {
    table: "market_weeks",
    file: "market_weeks.json.gz",
    types: {
      week: "date",
      btc_price_usd: "float8",
      total_market_cap_usd: "float8",
      btc_dominance: "float4",
      market_drawdown: "float4",
      phase: "text",
      cycle: "text",
    },
  },
  {
    table: "coins",
    file: "coins.json.gz",
    types: {
      id: "int4",
      lineage_id: "int4",
      name: "text",
      symbol: "text",
      slug: "text",
      status: "text",
      date_added: "date",
      is_token: "bool",
      excluded_reason: "text",
      price_factor: "float8",
      first_week: "date",
      last_week: "date",
    },
  },
  {
    table: "coin_weeks",
    file: "coin_weeks.json.gz",
    types: {
      lineage_id: "int4",
      week: "date",
      coin_id: "int4",
      rank_raw: "int2",
      rank_adj: "int2",
      price_usd: "float4",
      market_cap_usd: "float4",
      volume_24h_usd: "float4",
      is_continuation: "bool",
      running_peak_usd: "float4",
      drawdown: "float4",
      weeks_since_peak: "int2",
      age_weeks: "int2",
      ret_52w: "float4",
      beat_btc_52w: "bool",
      fell_out_52w: "bool",
      ret_104w: "float4",
      beat_btc_104w: "bool",
      fell_out_104w: "bool",
      reached_top20_104w: "bool",
      outcome_complete_104w: "bool",
    },
  },
];

const SEED_CURRENT_STATE = `
  INSERT INTO current_state (
    coin_id, lineage_id, as_of, source, rank_raw, rank_adj, price_usd, market_cap_usd,
    volume_24h_usd, running_peak_usd, drawdown, weeks_since_peak, age_weeks, peak_at, born_at
  )
  SELECT cw.coin_id, cw.lineage_id, cw.week::timestamptz, 'weekly', cw.rank_raw, cw.rank_adj,
    cw.price_usd / c.price_factor, cw.market_cap_usd, cw.volume_24h_usd, cw.running_peak_usd,
    cw.drawdown, cw.weeks_since_peak, cw.age_weeks,
    cw.week::timestamptz - make_interval(weeks => cw.weeks_since_peak),
    cw.week::timestamptz - make_interval(weeks => cw.age_weeks)
  FROM coin_weeks cw
  JOIN coins c ON c.id = cw.coin_id
  WHERE cw.week = (SELECT max(week) FROM market_weeks)
    AND NOT cw.is_continuation
    AND cw.drawdown IS NOT NULL`;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set");
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  const started = Date.now();

  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE current_state, coin_weeks, coins, market_weeks");

    for (const { table, file, types } of TABLES) {
      const data = await readJsonGz<Columns>(join(PANEL_DIR, file));
      const names = Object.keys(types);
      for (const name of names) {
        if (!data[name]) throw new Error(`${file} has no column ${name}`);
      }
      const total = data[names[0]].length;
      const insert =
        `INSERT INTO ${table} (${names.join(", ")}) ` +
        `SELECT * FROM unnest(${names.map((name, i) => `$${i + 1}::${types[name]}[]`).join(", ")})`;

      for (let start = 0; start < total; start += BATCH) {
        const params = names.map((name) => data[name].slice(start, start + BATCH));
        await client.query(insert, params);
        const done = Math.min(start + BATCH, total);
        if (done === total || (done / BATCH) % 10 === 0) {
          console.log(`${table}: ${done}/${total} (${Math.round((Date.now() - started) / 1000)}s)`);
        }
      }
    }

    const seeded = await client.query(SEED_CURRENT_STATE);
    console.log(`current_state: ${seeded.rowCount} coins seeded from the last snapshot`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await pool.query("ANALYZE coins, coin_weeks, market_weeks, current_state");
  const size = await pool.query<{ size: string }>(
    "SELECT pg_size_pretty(pg_database_size(current_database())) AS size",
  );
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s. Database size ${size.rows[0].size}.`);
  await pool.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
