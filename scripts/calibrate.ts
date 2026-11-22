/**
 * Walk-forward calibration: would the tool have been right in the past,
 * using only what was known at the time? Reads the panel (data/panel/),
 * writes data/calibration.json and the calibration tables. No CMC calls.
 *
 * At each test date T (first Sunday of each quarter, 2018 to the last date
 * with 104 weeks of future), every coin ranked 20 to 500 gets a prediction
 * from episodes whose outcome window had closed by T. The prediction is then
 * compared with what the coin actually did over the next 104 weeks.
 */
import { join } from "node:path";

import { Pool } from "@neondatabase/serverless";

import { inBands, rankBand, selectEpisodes, type CandidateRow } from "@/lib/engine/match";
import { decide, summarize, type EpisodeOutcome, type VerdictKind } from "@/lib/engine/verdict";
import { addWeeks, HORIZON_WEEKS } from "@/lib/verdict/analyze";

import { DATA_DIR, readJsonGz, writeJson } from "./lib/raw-store";

const PANEL_DIR = join(DATA_DIR, "panel");
const FIRST_TEST = "2018-01-01";
const RANK_MIN = 20;
const RANK_MAX = 500;
/** 104 weeks plus the 2-week tolerance at the end of an outcome window. */
const CLOSED_AFTER_WEEKS = HORIZON_WEEKS + 2;
const EXAMPLE_DATE = "2022-01-02";

type Columns = Record<string, unknown[]>;

interface Row extends CandidateRow {
  coinId: number;
  beat: boolean;
  fellOut: boolean;
  top20: boolean;
  ret: number;
}

/** First Sunday on or after the first day of each quarter. */
function quarterSundays(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  for (let y = start.getUTCFullYear(), m = 0; ; m += 3) {
    const day = new Date(Date.UTC(y, m, 1));
    day.setUTCDate(1 + ((7 - day.getUTCDay()) % 7));
    const iso = day.toISOString().slice(0, 10);
    if (iso > to) break;
    if (iso >= from) out.push(iso);
  }
  return out;
}

async function main() {
  const cw = await readJsonGz<Columns>(join(PANEL_DIR, "coin_weeks.json.gz"));
  const coinsPanel = await readJsonGz<Columns>(join(PANEL_DIR, "coins.json.gz"));
  const names = new Map<number, string>();
  coinsPanel.id.forEach((id, i) => names.set(id as number, `${coinsPanel.name[i]} (${coinsPanel.symbol[i]})`));

  // Complete rows grouped by adjusted rank, each group sorted by week.
  const byRank = new Map<number, Row[]>();
  const atWeek = new Map<string, Row[]>();
  const total = cw.week.length;
  for (let i = 0; i < total; i++) {
    if (!cw.outcome_complete_104w[i] || cw.drawdown[i] === null) continue;
    const row: Row = {
      lineageId: cw.lineage_id[i] as number,
      coinId: cw.coin_id[i] as number,
      week: cw.week[i] as string,
      rankAdj: cw.rank_adj[i] as number,
      drawdown: cw.drawdown[i] as number,
      ageWeeks: cw.age_weeks[i] as number,
      beat: cw.beat_btc_104w[i] === true,
      fellOut: cw.fell_out_104w[i] === true,
      top20: cw.reached_top20_104w[i] === true,
      ret: (cw.ret_104w[i] as number) ?? 0,
    };
    const group = byRank.get(row.rankAdj) ?? [];
    group.push(row);
    byRank.set(row.rankAdj, group);
    const list = atWeek.get(row.week) ?? [];
    list.push(row);
    atWeek.set(row.week, list);
  }
  for (const group of byRank.values()) group.sort((a, b) => a.week.localeCompare(b.week));

  const weeks = [...atWeek.keys()].sort();
  const lastStart = weeks[weeks.length - 1];
  const testDates = quarterSundays(FIRST_TEST, lastStart);
  console.log(`${testDates.length} test dates, ${testDates[0]} to ${testDates[testDates.length - 1]}`);

  // Base rate known at T: share of closed rank 20-500 rows that beat BTC.
  const baseByWeek = new Map<string, { k: number; n: number }>();
  for (const week of weeks) {
    let k = 0;
    let n = 0;
    for (const row of atWeek.get(week)!) {
      if (row.rankAdj < RANK_MIN || row.rankAdj > RANK_MAX) continue;
      n++;
      if (row.beat) k++;
    }
    baseByWeek.set(week, { k, n });
  }

  const points: { testDate: string; bucket: string; predicted: number; realized: number; n: number }[] = [];
  const verdicts: Record<VerdictKind, { n: number; beat: number }> = {
    not_enough_history: { n: 0, beat: 0 },
    rotate: { n: 0, beat: 0 },
    hold: { n: 0, beat: 0 },
    no_clear_edge: { n: 0, beat: 0 },
  };
  let brier = 0;
  let brierBase = 0;
  let predicted = 0;
  let tested = 0;
  const examples: Record<string, unknown>[] = [];

  for (const test of testDates) {
    const cutoff = addWeeks(test, -CLOSED_AFTER_WEEKS);
    let baseK = 0;
    let baseN = 0;
    for (const [week, counts] of baseByWeek) {
      if (week > cutoff) continue;
      baseK += counts.k;
      baseN += counts.n;
    }
    if (baseN === 0) continue;
    const base = baseK / baseN;
    const buckets = new Map<number, { p: number; y: number; n: number }>();

    for (const target of atWeek.get(test) ?? []) {
      if (target.rankAdj < RANK_MIN || target.rankAdj > RANK_MAX) continue;
      tested++;
      const band = rankBand(target.rankAdj);
      const candidates: Row[] = [];
      for (let rank = band.min; rank <= band.max; rank++) {
        for (const row of byRank.get(rank) ?? []) {
          if (row.week > cutoff) break;
          if (row.lineageId !== target.lineageId && inBands(target, row)) candidates.push(row);
        }
      }
      const episodes = selectEpisodes(candidates, target, target.lineageId);
      const outcomes: EpisodeOutcome[] = episodes.map((e) => ({
        lineageId: e.lineageId,
        cycle: e.cycle,
        beatBtc: e.beat,
        fellOut: e.fellOut,
        reachedTop20: e.top20,
        coinReturn: e.ret,
        btcReturn: 0,
      }));
      const summary = summarize(outcomes);
      const verdict = decide(summary);
      verdicts[verdict].n++;
      if (target.beat) verdicts[verdict].beat++;
      if (verdict === "not_enough_history") continue;

      const p = summary.beatBtc.p;
      const y = target.beat ? 1 : 0;
      brier += (p - y) ** 2;
      brierBase += (base - y) ** 2;
      predicted++;
      const bucket = Math.min(9, Math.floor(p * 10));
      const cell = buckets.get(bucket) ?? { p: 0, y: 0, n: 0 };
      cell.p += p;
      cell.y += y;
      cell.n++;
      buckets.set(bucket, cell);

      if (test === EXAMPLE_DATE) {
        examples.push({
          testDate: test,
          coin: names.get(target.coinId) ?? `#${target.coinId}`,
          rankAdj: target.rankAdj,
          drawdown: target.drawdown,
          n: summary.n,
          predicted: p,
          lo: summary.beatBtc.lo,
          hi: summary.beatBtc.hi,
          verdict,
          beatBtc: target.beat,
          fellOut: target.fellOut,
          ret104w: target.ret,
        });
      }
    }
    for (const [bucket, cell] of buckets) {
      points.push({
        testDate: test,
        bucket: `${bucket * 10}-${bucket * 10 + 10}%`,
        predicted: cell.p / cell.n,
        realized: cell.y / cell.n,
        n: cell.n,
      });
    }
  }

  examples.sort((a, b) => (a.rankAdj as number) - (b.rankAdj as number));
  const example = examples.find((e) => e.verdict !== "no_clear_edge") ?? examples[0] ?? null;
  const summary = {
    horizon: HORIZON_WEEKS,
    tested,
    predicted,
    brier: brier / predicted,
    brierBaseline: brierBase / predicted,
    verdicts,
    example,
  };
  console.log(JSON.stringify({ ...summary, example: undefined }, null, 2));
  console.log("example:", example);
  console.log("other examples:", examples.slice(0, 8).map((e) => `${e.coin} ${e.verdict} p=${(e.predicted as number).toFixed(2)} beat=${e.beatBtc}`).join("; "));

  // Reliability across all dates, for a quick look.
  const reliability = new Map<string, { p: number; y: number; n: number }>();
  for (const point of points) {
    const cell = reliability.get(point.bucket) ?? { p: 0, y: 0, n: 0 };
    cell.p += point.predicted * point.n;
    cell.y += point.realized * point.n;
    cell.n += point.n;
    reliability.set(point.bucket, cell);
  }
  for (const [bucket, cell] of [...reliability].sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    console.log(`${bucket.padEnd(8)} predicted ${(cell.p / cell.n).toFixed(3)} actual ${(cell.y / cell.n).toFixed(3)} n ${cell.n}`);
  }

  await writeJson(join(DATA_DIR, "calibration.json"), { summary, points });

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.log("No DATABASE_URL: wrote data/calibration.json only.");
    return;
  }
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM calibration_points WHERE horizon = $1", [HORIZON_WEEKS]);
    await client.query(
      `INSERT INTO calibration_points (horizon, test_date, bucket, predicted, realized, n)
       SELECT $1, * FROM unnest($2::date[], $3::text[], $4::float4[], $5::float4[], $6::int4[])`,
      [
        HORIZON_WEEKS,
        points.map((p) => p.testDate),
        points.map((p) => p.bucket),
        points.map((p) => p.predicted),
        points.map((p) => p.realized),
        points.map((p) => p.n),
      ],
    );
    await client.query(
      `INSERT INTO calibration_summary (horizon, brier, brier_baseline, n, tested, example_json, verdicts_json, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (horizon) DO UPDATE SET brier = excluded.brier, brier_baseline = excluded.brier_baseline,
         n = excluded.n, tested = excluded.tested, example_json = excluded.example_json,
         verdicts_json = excluded.verdicts_json, computed_at = excluded.computed_at`,
      [HORIZON_WEEKS, summary.brier, summary.brierBaseline, predicted, tested, JSON.stringify(example), JSON.stringify(verdicts)],
    );
    await client.query("COMMIT");
    console.log(`Saved ${points.length} calibration points.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
