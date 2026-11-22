/**
 * Walk-forward calibration: would the tool have been right in the past,
 * using only what was known at the time? Reads the panel (data/panel/),
 * writes data/calibration.json and the calibration tables. No CMC calls.
 *
 * At each test date T (first Sunday of each quarter, 2018 to the last date
 * with 104 weeks of future), every coin with adjusted rank 2 to 1,000 (the
 * ranks the app serves; rank 1 is BTC) gets a prediction from episodes whose
 * outcome window had closed by T. The prediction is then compared with what
 * the coin actually did over the next 104 weeks. Results are also split by
 * rank band (2-19, 20-500, 501-1000).
 */
import { join } from "node:path";

import { Pool } from "@neondatabase/serverless";

import {
  BAND_STEPS,
  inBands,
  rankBand,
  selectEpisodes,
  type CandidateRow,
} from "@/lib/engine/match";
import {
  MIN_EPISODES,
  decide,
  summarize,
  type EpisodeOutcome,
  type VerdictKind,
} from "@/lib/engine/verdict";
import {
  RANK_BANDS,
  RANK_MAX,
  RANK_MIN,
  bandIndex,
  brierGain,
  byYear,
  emptyBandSums,
  gainInterval,
  toBandScore,
  type DateScore,
} from "@/lib/calibration/score";
import { addWeeks, HORIZON_WEEKS } from "@/lib/verdict/analyze";

import { DATA_DIR, readJsonGz, writeJson } from "./lib/raw-store";

const PANEL_DIR = join(DATA_DIR, "panel");
const FIRST_TEST = "2018-01-01";
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
  const coinsPanel = await readJsonGz<Columns>(
    join(PANEL_DIR, "coins.json.gz"),
  );
  const names = new Map<number, string>();
  coinsPanel.id.forEach((id, i) =>
    names.set(id as number, `${coinsPanel.name[i]} (${coinsPanel.symbol[i]})`),
  );

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
  for (const group of byRank.values())
    group.sort((a, b) => a.week.localeCompare(b.week));

  const weeks = [...atWeek.keys()].sort();
  const lastStart = weeks[weeks.length - 1];
  const testDates = quarterSundays(FIRST_TEST, lastStart);
  console.log(
    `${testDates.length} test dates, ${testDates[0]} to ${testDates[testDates.length - 1]}`,
  );

  // Base rate known at T: share of closed rows (adjusted rank 2 to 1,000)
  // that beat BTC, overall and inside each rank band. Index 0 is the overall
  // count, index 1 + i is RANK_BANDS[i].
  const slots = RANK_BANDS.length + 1;
  const baseByWeek = new Map<string, { k: number[]; n: number[] }>();
  for (const week of weeks) {
    const k = new Array<number>(slots).fill(0);
    const n = new Array<number>(slots).fill(0);
    for (const row of atWeek.get(week)!) {
      const bi = row.rankAdj < RANK_MIN ? -1 : bandIndex(row.rankAdj);
      if (bi < 0) continue;
      n[0]++;
      n[1 + bi]++;
      if (row.beat) {
        k[0]++;
        k[1 + bi]++;
      }
    }
    baseByWeek.set(week, { k, n });
  }

  const points: {
    testDate: string;
    bucket: string;
    predicted: number;
    realized: number;
    n: number;
  }[] = [];
  const verdicts: Record<VerdictKind, { n: number; beat: number }> = {
    not_enough_history: { n: 0, beat: 0 },
    rotate: { n: 0, beat: 0 },
    hold: { n: 0, beat: 0 },
    no_clear_edge: { n: 0, beat: 0 },
  };
  const bandSums = RANK_BANDS.map(() => emptyBandSums(Object.keys(verdicts)));
  /** Predictions that needed step i of BAND_STEPS (index 0 unused). */
  const widened = BAND_STEPS.map(() => 0);
  let brier = 0;
  let brierBase = 0;
  const dateScores: DateScore[] = [];
  let predicted = 0;
  let tested = 0;
  const examples: Record<string, unknown>[] = [];

  for (const test of testDates) {
    const cutoff = addWeeks(test, -CLOSED_AFTER_WEEKS);
    const baseK = new Array<number>(slots).fill(0);
    const baseN = new Array<number>(slots).fill(0);
    for (const [week, counts] of baseByWeek) {
      if (week > cutoff) continue;
      for (let i = 0; i < slots; i++) {
        baseK[i] += counts.k[i];
        baseN[i] += counts.n[i];
      }
    }
    if (baseN[0] === 0) continue;
    const base = baseK[0] / baseN[0];
    const buckets = new Map<number, { p: number; y: number; n: number }>();
    const day: DateScore = { testDate: test, n: 0, brier: 0, base: 0 };

    for (const target of atWeek.get(test) ?? []) {
      if (target.rankAdj < RANK_MIN || target.rankAdj > RANK_MAX) continue;
      const bi = bandIndex(target.rankAdj);
      const sums = bandSums[bi];
      // This band's own base rate known at T (falls back to the overall one
      // in the unlikely case the band has no closed rows yet).
      const bandBase = baseN[1 + bi] ? baseK[1 + bi] / baseN[1 + bi] : base;
      tested++;
      sums.tested++;
      // Same widening as the app: standard bands, then wider fixed steps
      // while n is under the minimum.
      let episodes: ReturnType<typeof selectEpisodes<Row>> = [];
      for (let i = 0; i < BAND_STEPS.length; i++) {
        const step = BAND_STEPS[i];
        const band = rankBand(target.rankAdj, step);
        const candidates: Row[] = [];
        for (let rank = band.min; rank <= band.max; rank++) {
          for (const row of byRank.get(rank) ?? []) {
            if (row.week > cutoff) break;
            if (
              row.lineageId !== target.lineageId &&
              inBands(target, row, step)
            )
              candidates.push(row);
          }
        }
        episodes = selectEpisodes(candidates, target, target.lineageId, step);
        if (episodes.length >= MIN_EPISODES) {
          if (i > 0) widened[i]++;
          break;
        }
      }
      const outcomes: EpisodeOutcome[] = episodes.map((e) => ({
        lineageId: e.lineageId,
        week: e.week,
        cycle: e.cycle,
        beatBtc: e.beat,
        fellOut: e.fellOut,
        reachedTop20: e.top20,
        coinReturn: e.ret,
        btcReturn: null,
      }));
      const summary = summarize(outcomes);
      const verdict = decide(summary);
      verdicts[verdict].n++;
      if (target.beat) verdicts[verdict].beat++;
      sums.verdicts[verdict].n++;
      if (target.beat) sums.verdicts[verdict].beat++;
      if (verdict === "not_enough_history") continue;

      const p = summary.beatBtc.p;
      const y = target.beat ? 1 : 0;
      brier += (p - y) ** 2;
      brierBase += (base - y) ** 2;
      predicted++;
      sums.predicted++;
      sums.brier += (p - y) ** 2;
      sums.base += (bandBase - y) ** 2;
      day.n++;
      day.brier += (p - y) ** 2;
      day.base += (base - y) ** 2;
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
    if (day.n) dateScores.push(day);
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
  const example =
    examples.find((e) => e.verdict !== "no_clear_edge") ?? examples[0] ?? null;
  const detail = {
    gain: brierGain(dateScores),
    gainInterval: gainInterval(dateScores),
    byYear: byYear(dateScores),
    /** Same scores split by adjusted-rank band, each against its own base rate. */
    byBand: RANK_BANDS.map((band, i) => toBandScore(band, bandSums[i])),
    /** Predictions per BAND_STEPS entry; index 0 is the standard match. */
    steps: BAND_STEPS.map((_, i) =>
      i === 0
        ? predicted - widened.slice(1).reduce((a, b) => a + b, 0)
        : widened[i],
    ),
  };
  const summary = {
    horizon: HORIZON_WEEKS,
    tested,
    predicted,
    brier: brier / predicted,
    brierBaseline: brierBase / predicted,
    verdicts,
    example,
    detail,
  };
  console.log(JSON.stringify({ ...summary, example: undefined }, null, 2));
  console.log("example:", example);
  console.log("predictions that needed a wider step:", widened.slice(1));
  console.log(
    `Brier gain ${(detail.gain * 100).toFixed(1)}%, 95% block-bootstrap range ${(detail.gainInterval.lo * 100).toFixed(1)}% to ${(detail.gainInterval.hi * 100).toFixed(1)}%`,
  );
  for (const band of detail.byBand)
    console.log(
      `band ${band.band}: tested ${band.tested} predicted ${band.predicted} brier ${band.brier.toFixed(4)} baseline ${band.brierBaseline.toFixed(4)} gain ${(band.gain * 100).toFixed(1)}% verdicts ${Object.entries(
        band.verdicts,
      )
        .map(([k, v]) => `${k} ${v.n} (beat ${v.beat})`)
        .join(", ")}`,
    );
  for (const year of detail.byYear)
    console.log(
      `${year.year} n ${year.n} brier ${year.brier.toFixed(4)} baseline ${year.brierBaseline.toFixed(4)} gain ${(year.gain * 100).toFixed(1)}%`,
    );
  console.log(
    "other examples:",
    examples
      .slice(0, 8)
      .map(
        (e) =>
          `${e.coin} ${e.verdict} p=${(e.predicted as number).toFixed(2)} beat=${e.beatBtc}`,
      )
      .join("; "),
  );

  // Reliability across all dates, for a quick look.
  const reliability = new Map<string, { p: number; y: number; n: number }>();
  for (const point of points) {
    const cell = reliability.get(point.bucket) ?? { p: 0, y: 0, n: 0 };
    cell.p += point.predicted * point.n;
    cell.y += point.realized * point.n;
    cell.n += point.n;
    reliability.set(point.bucket, cell);
  }
  for (const [bucket, cell] of [...reliability].sort(
    (a, b) => parseInt(a[0]) - parseInt(b[0]),
  )) {
    console.log(
      `${bucket.padEnd(8)} predicted ${(cell.p / cell.n).toFixed(3)} actual ${(cell.y / cell.n).toFixed(3)} n ${cell.n}`,
    );
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
    await client.query("DELETE FROM calibration_points WHERE horizon = $1", [
      HORIZON_WEEKS,
    ]);
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
      `INSERT INTO calibration_summary (horizon, brier, brier_baseline, n, tested, example_json, verdicts_json, detail_json, computed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (horizon) DO UPDATE SET brier = excluded.brier, brier_baseline = excluded.brier_baseline,
         n = excluded.n, tested = excluded.tested, example_json = excluded.example_json,
         verdicts_json = excluded.verdicts_json, detail_json = excluded.detail_json,
         computed_at = excluded.computed_at`,
      [
        HORIZON_WEEKS,
        summary.brier,
        summary.brierBaseline,
        predicted,
        tested,
        JSON.stringify(example),
        JSON.stringify(verdicts),
        JSON.stringify(detail),
      ],
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
