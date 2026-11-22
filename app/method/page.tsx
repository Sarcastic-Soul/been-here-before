import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";

import { ReliabilityChart } from "@/components/reliability-chart";
import { getCalibration } from "@/lib/calibration/get-calibration";
import { CYCLES } from "@/lib/engine/cycles";
import { AGE_BUCKETS, DRAWDOWN_BAND, RANK_FACTOR } from "@/lib/engine/match";
import { HOLD_ABOVE, MIN_EPISODES, ROTATE_BELOW } from "@/lib/engine/verdict";
import {
  count,
  drawdownPct,
  longDate,
  pct,
  pctRange,
  signedPct,
} from "@/lib/format";

export const metadata: Metadata = {
  title: "Method",
  description:
    "How Been Here Before matches coins, counts dead coins, scores outcomes against BTC, and how well it did when tested on the past.",
};

const VERDICT_LABEL: Record<string, string> = {
  rotate: "History favors rotating to BTC",
  no_clear_edge: "No clear edge",
  hold: "History favors holding",
  not_enough_history: "Not enough history (no verdict)",
};

/** "History favors rotating to BTC" -> "history favors rotating to BTC". */
function lowerFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mb-4 scroll-mt-6 font-serif text-[30px] leading-tight tracking-[-0.01em]"
    >
      {children}
    </h2>
  );
}

export default function MethodPage() {
  return (
    <div className="mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-12">
      <div className="grid gap-12 py-12 lg:grid-cols-[220px_1fr] lg:gap-16">
        <nav aria-label="On this page" className="hidden lg:block">
          <ol className="sticky top-6 space-y-2 text-sm">
            {[
              ["question", "The question"],
              ["data", "Data"],
              ["universe", "Which coins count"],
              ["same-spot", "Same spot"],
              ["outcomes", "Outcomes"],
              ["verdict", "The verdict rule"],
              ["calibration", "Tested on the past"],
              ["limits", "Known limits"],
            ].map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="link text-ink-body">
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="text-ink-body [&_b]:text-ink max-w-[46em] space-y-14 text-[17px] leading-relaxed">
          <header>
            <h1 className="text-ink mb-4 font-serif text-[clamp(40px,5vw,64px)] leading-[1] font-normal tracking-[-0.025em]">
              Method
            </h1>
            <p className="text-[19px]">
              Every rule here exists to keep the numbers honest: no hindsight,
              no survivors-only history, and no verdict without enough evidence.
            </p>
          </header>

          <section>
            <H2 id="question">The question</H2>
            <p>
              “Coins that were where my coin is now: how many did better than
              just holding BTC over the next two years?” The answer is a{" "}
              <b>base rate</b>. It describes what happened to coins like yours,
              not what will happen to yours.
            </p>
          </section>

          <section>
            <H2 id="data">Data</H2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Weekly snapshots from CoinMarketCap’s{" "}
                <code className="num text-[15px]">
                  /v1/cryptocurrency/listings/historical
                </code>
                , every Sunday since 28 April 2013, top 5,000 by rank each week.
              </li>
              <li>
                <code className="num text-[15px]">/v1/cryptocurrency/map</code>{" "}
                with inactive and untracked coins, so dead coins keep their
                names.
              </li>
              <li>
                <code className="num text-[15px]">
                  /v1/global-metrics/quotes/historical
                </code>{" "}
                for total market cap.
              </li>
              <li>
                Today’s numbers come from one daily call to{" "}
                <code className="num text-[15px]">
                  /v1/cryptocurrency/listings/latest
                </code>
                . Pages never call CoinMarketCap; every coin page has a Receipts
                drawer with the raw row.
              </li>
            </ul>
          </section>

          <section>
            <H2 id="universe">Which coins count</H2>
            <p className="mb-3">
              Stablecoins and wrapped, bridged or staked tokens are removed:
              their price follows another asset, so their rank says nothing
              about their own fate. The test uses CoinMarketCap tags, name and
              symbol rules, and a data check (price locked to BTC, ETH, BNB, SOL
              or USD over the coin’s whole life).
            </p>
            <p>
              <b>Rank</b> on this site is the rank among the coins that remain.
              There were about 500 coins in 2014 and over 10,000 now, so this
              keeps “rank 66” meaning roughly the same thing in every year.
              Coins that moved to a new contract (MATIC to POL, LEND to AAVE,
              FTM to S) are joined into one history; a collapse like LUNA is a
              death, not a move.
            </p>
          </section>

          <section>
            <H2 id="same-spot">What “same spot” means</H2>
            <div className="overflow-x-auto">
              <table className="mb-4 w-full min-w-[320px] border-collapse text-[15px]">
                <thead>
                  <tr className="text-muted text-left text-xs">
                    <th className="border-ink border-b py-2 font-medium">
                      Feature
                    </th>
                    <th className="border-ink border-b py-2 font-medium">
                      Match band
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-rule border-b py-2.5 pr-6">Rank</td>
                    <td className="border-rule border-b py-2.5">
                      your rank ÷ {RANK_FACTOR} to your rank × {RANK_FACTOR}
                    </td>
                  </tr>
                  <tr>
                    <td className="border-rule border-b py-2.5 pr-6">
                      Drop from the peak so far
                    </td>
                    <td className="border-rule border-b py-2.5">
                      within {Math.round(DRAWDOWN_BAND * 100)} percentage points
                    </td>
                  </tr>
                  <tr>
                    <td className="border-rule border-b py-2.5 pr-6">
                      Time since CoinMarketCap listed it
                    </td>
                    <td className="border-rule border-b py-2.5">
                      same bucket: {AGE_BUCKETS.map((b) => b.label).join(", ")}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mb-3">
              Every feature uses only data up to that week. The peak is the{" "}
              <b>peak so far</b>, never the all-time peak, and a test checks
              that deleting all later rows changes nothing. Tags and categories
              are not used: they are today’s labels, and old coins get tagged
              “AI” later.
            </p>
            <p>
              A coin can sit in the same spot for months. To stop near-copies
              from inflating the count, each coin counts once per BTC halving
              cycle: the first week it entered the spot. Your own coin is never
              its own twin.
            </p>
          </section>

          <section>
            <H2 id="outcomes">Outcomes</H2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <b>Beat BTC</b>: the coin’s price change over the next 104 weeks
                was bigger than BTC’s over the same weeks.
              </li>
              <li>
                <b>Fell out</b>: left the top 5,000 or became inactive and did
                not come back within the window. Counted as a total loss, not as
                missing data.
              </li>
              <li>
                Episodes newer than two years have no full outcome yet and are
                left out, so the most recent months never count.
              </li>
              <li>
                Rates come with <b>Wilson 95% ranges</b>, which behave well for
                small counts and rates near 0 or 1. Returns use medians, because
                crypto returns have huge tails.
              </li>
              <li>
                Halving cycles used for the split:{" "}
                {CYCLES.map((c) => c.label).join("; ")}.
              </li>
            </ul>
          </section>

          <section>
            <H2 id="verdict">The verdict rule</H2>
            <p className="mb-4">
              Let <i>p</i> be the share that beat BTC over two years, with 95%
              range [low, high]. The thresholds were fixed before looking at
              results and are never tuned per coin.
            </p>
            <table className="w-full border-collapse text-[15px]">
              <tbody>
                {[
                  [
                    `fewer than ${MIN_EPISODES} episodes`,
                    "Not enough history. Shows the twins, no verdict.",
                  ],
                  [
                    `high below ${pct(ROTATE_BELOW)}`,
                    "History favors rotating to BTC.",
                  ],
                  [`low above ${pct(HOLD_ABOVE)}`, "History favors holding."],
                  ["anything else", "No clear edge."],
                ].map(([when, then]) => (
                  <tr key={when}>
                    <td className="num border-rule border-b py-2.5 pr-6 text-[14px]">
                      {when}
                    </td>
                    <td className="border-rule border-b py-2.5">{then}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <H2 id="calibration">Tested on the past</H2>
            <Suspense fallback={<div className="skeleton h-96 w-full" />}>
              <CalibrationSection />
            </Suspense>
          </section>

          <section>
            <H2 id="limits">Known limits</H2>
            <ul className="list-disc space-y-2 pl-5">
              <li>The CoinMarketCap listing date is not the launch date.</li>
              <li>Weekly snapshots miss moves inside the week.</li>
              <li>
                Counting a coin that fell out as a total loss is harsh for the
                few that came back later.
              </li>
              <li>
                History before 2017 has few coins, so the early cycles have
                small counts.
              </li>
              <li>
                Past base rates do not predict any single coin. This is not
                financial advice.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

async function CalibrationSection() {
  await connection();
  const calibration = await getCalibration();
  if (!calibration) return <p>The test has not run yet.</p>;
  const example = calibration.example as {
    coin: string;
    testDate: string;
    rankAdj: number;
    drawdown: number;
    n: number;
    predicted: number;
    lo: number;
    hi: number;
    verdict: string;
    ret104w: number;
    beatBtc: boolean;
  } | null;
  const gain = 1 - calibration.brier / calibration.brierBaseline;
  const refusals = calibration.verdicts.not_enough_history?.n ?? 0;
  const biggest = [...calibration.reliability].sort((a, b) => b.n - a.n)[0];

  return (
    <div className="space-y-6">
      <p>
        Every quarter from January 2018, for every coin ranked 20 to 500, we
        asked the tool for its answer using{" "}
        <b>only episodes whose two years had already ended</b>, then checked
        what happened next. {count(calibration.tested)} coin-dates were tested;
        it gave a share for {count(calibration.predicted)} and refused{" "}
        {count(refusals)} for too little history.
      </p>

      <div className="grid gap-8 md:grid-cols-[1fr_auto]">
        <ReliabilityChart points={calibration.reliability} />
        <dl className="grid content-start gap-5 md:w-[220px]">
          <div>
            <dt className="label">Brier score, lower is better</dt>
            <dd className="num text-ink mt-1 text-[28px]">
              {calibration.brier.toFixed(4)}
            </dd>
          </div>
          <div>
            <dt className="label">Plain base rate</dt>
            <dd className="num text-ink mt-1 text-[28px]">
              {calibration.brierBaseline.toFixed(4)}
            </dd>
          </div>
          <div>
            <dt className="label">Gain over the base rate</dt>
            <dd className="num text-ink mt-1 text-[28px]">{pct(gain, 1)}</dd>
          </div>
        </dl>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-[15px]">
          <caption className="text-muted mb-2 text-left text-sm">
            What happened after each verdict
          </caption>
          <thead>
            <tr className="text-muted text-left text-xs">
              <th className="border-ink border-b py-2 font-medium">
                Verdict given
              </th>
              <th className="border-ink border-b py-2 text-right font-medium">
                Times
              </th>
              <th className="border-ink border-b py-2 text-right font-medium">
                Then beat BTC
              </th>
            </tr>
          </thead>
          <tbody>
            {["rotate", "no_clear_edge", "hold", "not_enough_history"].map(
              (key) => {
                const row = calibration.verdicts[key] ?? { n: 0, beat: 0 };
                return (
                  <tr key={key}>
                    <td className="border-rule border-b py-2.5">
                      {VERDICT_LABEL[key]}
                    </td>
                    <td className="num border-rule border-b py-2.5 text-right">
                      {count(row.n)}
                    </td>
                    <td className="num border-rule border-b py-2.5 text-right">
                      {row.n ? pct(row.beat / row.n) : "never given"}
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </div>

      {example && (
        <p className="border-accent border-l-2 pl-5">
          <b>One plain example.</b> On {longDate(example.testDate)}, using only
          earlier data, {example.coin} was rank {example.rankAdj} and down{" "}
          {drawdownPct(example.drawdown)} from its peak so far. It matched{" "}
          {example.n} past episodes; {pct(example.predicted)} of them had beaten
          BTC (range {pctRange(example.lo, example.hi)}). Verdict:{" "}
          {lowerFirst(VERDICT_LABEL[example.verdict] ?? example.verdict)}. Over
          the next two years its price changed {signedPct(example.ret104w)} and
          it {example.beatBtc ? "beat" : "lagged"} BTC.
        </p>
      )}

      <p>
        <b>What this says, honestly.</b> When the tool said “rotate”, it was
        right most of the time, but most altcoins lagged BTC in these years
        anyway, so that is the easy call. The Brier score beats a plain base
        rate by only {pct(gain, 1)}. The shares it gives run high
        {biggest
          ? `: in its busiest bucket, predictions averaging ${pct(biggest.predicted)} came true ${pct(biggest.realized)} of the time`
          : ""}
        , likely because the earlier cycles, with the 2017 boom, were kinder to
        altcoins than 2018 to 2024. “Hold” never fired. We kept the thresholds
        as they were set before the test.
      </p>
    </div>
  );
}
