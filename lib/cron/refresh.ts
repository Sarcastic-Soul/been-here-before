import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { cmcGet, CmcError, type CmcReceipt } from "@/lib/cmc/client";

import { dailyStates, type Anchor, type KnownCoin, type ListingRow } from "./daily-state";

/** Enough raw ranks to cover adjusted rank 1000 after stablecoins and wrappers. */
export const LISTING_LIMIT = 2000;
const ENDPOINT = "/v1/cryptocurrency/listings/latest";

interface RawListing {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  cmc_rank: number;
  date_added?: string | null;
  tags?: string[] | null;
  platform?: unknown;
  quote?: { USD?: { price?: number | null; market_cap?: number | null; volume_24h?: number | null } };
}

function sundayOnOrBefore(day: Date): string {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

async function logCall(sql: NeonQueryFunction<false, false>, receipt: CmcReceipt) {
  await sql.query("INSERT INTO credit_log (endpoint, credits, http_status) VALUES ($1, $2, $3)", [
    receipt.endpoint,
    receipt.creditCount,
    receipt.httpStatus,
  ]);
}

/**
 * The only code outside scripts/ that calls CMC. One listings/latest call,
 * then current_state is replaced in one transaction.
 */
export async function refreshCurrentState() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = neon(url);

  let result;
  try {
    result = await cmcGet<RawListing[]>(ENDPOINT, {
      start: 1,
      limit: LISTING_LIMIT,
      convert: "USD",
      aux: "tags,platform,date_added,cmc_rank",
    });
  } catch (error) {
    if (error instanceof CmcError) await logCall(sql, error.receipt);
    throw error;
  }
  const { data, body, receipt } = result;
  await logCall(sql, receipt);

  const timestamp = (body as { status?: { timestamp?: string } }).status?.timestamp;
  const asOf = timestamp ? new Date(timestamp) : new Date(receipt.fetchedAt);
  const rows: ListingRow[] = data.map((raw) => ({
    id: raw.id,
    name: raw.name,
    symbol: raw.symbol,
    slug: raw.slug,
    cmcRank: raw.cmc_rank,
    price: raw.quote?.USD?.price ?? 0,
    marketCap: raw.quote?.USD?.market_cap ?? null,
    volume24h: raw.quote?.USD?.volume_24h ?? null,
    dateAdded: raw.date_added ?? null,
    tags: raw.tags ?? [],
    isToken: !!raw.platform,
  }));

  const ids = rows.map((row) => row.id);
  const knownRows = (await sql.query(
    "SELECT id, lineage_id, price_factor, excluded_reason FROM coins WHERE id = ANY($1::int4[])",
    [ids],
  )) as { id: number; lineage_id: number; price_factor: number; excluded_reason: string | null }[];
  const known = new Map<number, KnownCoin>(
    knownRows.map((row) => [
      row.id,
      { lineageId: row.lineage_id, priceFactor: row.price_factor, excludedReason: row.excluded_reason },
    ]),
  );

  const lineages = [...new Set(rows.map((row) => known.get(row.id)?.lineageId ?? row.id))];
  const anchors = new Map<number, Anchor>();
  const stateRows = (await sql.query(
    `SELECT DISTINCT ON (lineage_id) lineage_id, running_peak_usd, peak_at, born_at
     FROM current_state WHERE lineage_id = ANY($1::int4[]) AND peak_at IS NOT NULL
     ORDER BY lineage_id, running_peak_usd DESC`,
    [lineages],
  )) as { lineage_id: number; running_peak_usd: number; peak_at: string; born_at: string }[];
  for (const row of stateRows) {
    anchors.set(row.lineage_id, {
      runningPeak: row.running_peak_usd,
      peakAt: new Date(row.peak_at),
      bornAt: new Date(row.born_at),
    });
  }
  const missing = lineages.filter((id) => !anchors.has(id));
  if (missing.length) {
    const history = (await sql.query(
      `SELECT DISTINCT ON (lineage_id) lineage_id, week, running_peak_usd, weeks_since_peak, age_weeks
       FROM coin_weeks
       WHERE lineage_id = ANY($1::int4[]) AND NOT is_continuation AND running_peak_usd IS NOT NULL
       ORDER BY lineage_id, week DESC`,
      [missing],
    )) as { lineage_id: number; week: string; running_peak_usd: number; weeks_since_peak: number; age_weeks: number }[];
    for (const row of history) {
      const week = Date.parse(`${String(row.week).slice(0, 10)}T00:00:00Z`);
      anchors.set(row.lineage_id, {
        runningPeak: row.running_peak_usd,
        peakAt: new Date(week - row.weeks_since_peak * 7 * 86_400_000),
        bornAt: new Date(week - row.age_weeks * 7 * 86_400_000),
      });
    }
  }

  const { states, newCoins, excluded } = dailyStates(rows, known, anchors, asOf);
  const week = sundayOnOrBefore(asOf);

  await sql.transaction([
    sql.query(
      `INSERT INTO coins (id, lineage_id, name, symbol, slug, status, date_added, is_token, excluded_reason, price_factor, first_week, last_week)
       SELECT id, id, name, symbol, slug, 'active', date_added, is_token, excluded_reason, 1, $8::date, $8::date
       FROM unnest($1::int4[], $2::text[], $3::text[], $4::text[], $5::date[], $6::bool[], $7::text[])
         AS t(id, name, symbol, slug, date_added, is_token, excluded_reason)
       ON CONFLICT (id) DO NOTHING`,
      [
        newCoins.map((c) => c.id),
        newCoins.map((c) => c.name),
        newCoins.map((c) => c.symbol),
        newCoins.map((c) => c.slug),
        newCoins.map((c) => c.dateAdded?.slice(0, 10) ?? null),
        newCoins.map((c) => c.isToken),
        newCoins.map((c) => c.excludedReason),
        week,
      ],
    ),
    sql.query("DELETE FROM current_state"),
    sql.query(
      `INSERT INTO current_state (coin_id, lineage_id, as_of, source, rank_raw, rank_adj, price_usd, market_cap_usd,
         volume_24h_usd, running_peak_usd, drawdown, weeks_since_peak, age_weeks, peak_at, born_at)
       SELECT coin_id, lineage_id, $14::timestamptz, 'daily', rank_raw, rank_adj, price_usd, market_cap_usd,
         volume_24h_usd, running_peak_usd, drawdown, weeks_since_peak, age_weeks, peak_at, born_at
       FROM unnest($1::int4[], $2::int4[], $3::int2[], $4::int2[], $5::float8[], $6::float8[], $7::float8[],
         $8::float8[], $9::float4[], $10::int2[], $11::int2[], $12::timestamptz[], $13::timestamptz[])
         AS t(coin_id, lineage_id, rank_raw, rank_adj, price_usd, market_cap_usd, volume_24h_usd,
           running_peak_usd, drawdown, weeks_since_peak, age_weeks, peak_at, born_at)`,
      [
        states.map((s) => s.coinId),
        states.map((s) => s.lineageId),
        states.map((s) => s.rankRaw),
        states.map((s) => s.rankAdj),
        states.map((s) => s.priceUsd),
        states.map((s) => s.marketCapUsd),
        states.map((s) => s.volume24hUsd),
        states.map((s) => s.runningPeakUsd),
        states.map((s) => s.drawdown),
        states.map((s) => s.weeksSincePeak),
        states.map((s) => s.ageWeeks),
        states.map((s) => s.peakAt.toISOString()),
        states.map((s) => s.bornAt.toISOString()),
        asOf.toISOString(),
      ],
    ),
    sql.query(
      `INSERT INTO cmc_receipts (kind, endpoint, request_url, fetched_at, http_status, credit_count, body)
       VALUES ('listings_latest', $1, $2, $3, $4, $5, $6)
       ON CONFLICT (kind) DO UPDATE SET endpoint = excluded.endpoint, request_url = excluded.request_url,
         fetched_at = excluded.fetched_at, http_status = excluded.http_status,
         credit_count = excluded.credit_count, body = excluded.body`,
      [receipt.endpoint, receipt.requestUrl, receipt.fetchedAt, receipt.httpStatus, receipt.creditCount, JSON.stringify(body)],
    ),
  ]);

  return {
    asOf: asOf.toISOString(),
    listed: rows.length,
    excluded,
    states: states.length,
    newCoins: newCoins.length,
    credits: receipt.creditCount,
  };
}
