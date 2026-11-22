import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { CoinSearch } from "@/components/coin-search";
import { TwinChart } from "@/components/twin-chart";
import { VerdictSummary } from "@/components/verdict-summary";
import { getCalibration } from "@/lib/calibration/get-calibration";
import { count, monthYear, pct } from "@/lib/format";
import { getPanelStats } from "@/lib/verdict/get-stats";
import { getVerdictOrSaved } from "@/lib/verdict/saved";
import { toTwinSeries } from "@/lib/verdict/twin-series";

const EXAMPLE_SLUG = "filecoin";
const TRY = [
  ["filecoin", "Filecoin"],
  ["polkadot-new", "Polkadot"],
  ["algorand", "Algorand"],
  ["dogecoin", "Dogecoin"],
] as const;

export default function Home() {
  return (
    <>
      <div className="mx-auto grid max-w-[1360px] gap-12 px-4 pt-10 pb-16 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-12 lg:pt-14 lg:pb-20">
        <section aria-labelledby="hero-title" className="rise">
          <h1
            id="hero-title"
            className="mb-7 font-serif text-[clamp(44px,5.6vw,84px)] leading-[0.98] font-normal tracking-[-0.025em]"
          >
            Every coin that stood where yours stands{" "}
            <em className="text-accent">now.</em>
          </h1>
          <p className="text-ink-body mb-9 max-w-[30em] text-[19px] leading-relaxed">
            Type a coin. We find every past coin with the same rank, age and
            drop from its peak, in weekly CoinMarketCap snapshots back to 2013,
            dead coins included. Then we count how many beat simply holding BTC
            over the next two years.
          </p>
          <CoinSearch />
          <p className="text-muted mt-1 flex flex-wrap items-center gap-x-3 text-sm">
            Try
            {TRY.map(([slug, name]) => (
              <Link
                key={slug}
                href={`/coin/${slug}`}
                className="link text-ink inline-flex min-h-11 items-center"
              >
                {name}
              </Link>
            ))}
          </p>
        </section>

        <section
          aria-label="Example: Filecoin today"
          className="rise border-ink border-t-4 border-double pt-4 [--i:2]"
        >
          <Suspense fallback={<SheetSkeleton />}>
            <ExampleVerdict />
          </Suspense>
        </section>
      </div>

      <section aria-labelledby="how-title" className="border-ink border-t">
        <div className="mx-auto grid max-w-[1360px] gap-10 px-4 py-14 sm:px-8 lg:grid-cols-[1fr_2fr] lg:px-12">
          <div>
            <h2
              id="how-title"
              className="font-serif text-[34px] leading-tight tracking-[-0.01em]"
            >
              How it counts
            </h2>
            <Suspense fallback={<p className="skeleton mt-4 h-20 w-64" />}>
              <PanelLine />
            </Suspense>
          </div>
          <ol className="grid gap-x-10 sm:grid-cols-2">
            {[
              [
                "Same spot, not same story",
                "Rank within 1.5x of yours, the same age bucket, and a drop from the peak so far within 10 points. No tags or categories: those are today’s labels and would leak hindsight.",
              ],
              [
                "Dead coins count",
                "A coin that left the top 5,000 counts as a total loss, not as missing data. Leaving them out is how most backtests flatter altcoins.",
              ],
              [
                "Against BTC, over two years",
                "Each past episode is scored on one question: did it beat holding BTC from the same week for 104 weeks? Each coin counts once per halving cycle.",
              ],
              [
                "Says when it does not know",
                "Under 20 past episodes, no verdict. Every rate comes with a 95% range, and the split by cycle shows if one era drives the number.",
              ],
            ].map(([title, body], i) => (
              <li key={title} className="border-rule border-t py-5">
                <span className="num text-accent-text text-xs">0{i + 1}</span>
                <h3 className="mt-1 mb-1.5 text-[17px] font-semibold">
                  {title}
                </h3>
                <p className="text-ink-body text-[15px]">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="honest-title" className="bg-ink text-paper">
        <div className="mx-auto max-w-[1360px] px-4 py-14 sm:px-8 lg:px-12">
          <Suspense fallback={<div className="h-40" />}>
            <CalibrationStrip />
          </Suspense>
        </div>
      </section>
    </>
  );
}

async function ExampleVerdict() {
  await connection();
  const { data } = await getVerdictOrSaved(EXAMPLE_SLUG);
  if (data.status !== "ok")
    return (
      <p className="text-muted">The example is not available right now.</p>
    );
  return (
    <>
      <VerdictSummary data={data} headingLevel={2} />
      {data.twins.length > 0 && (
        <div className="mt-8">
          <h3 className="label mb-3">Five closest twins, price vs BTC</h3>
          <TwinChart twins={toTwinSeries(data.twins)} height={240} />
        </div>
      )}
      <Link
        href={`/coin/${EXAMPLE_SLUG}`}
        className="text-ink hover:text-accent-text mt-6 inline-flex min-h-11 items-center gap-2 font-medium"
      >
        Open the full Filecoin page <ArrowRight size={16} aria-hidden />
      </Link>
    </>
  );
}

async function PanelLine() {
  await connection();
  const stats = await getPanelStats();
  return (
    <p className="text-ink-body mt-4 max-w-[26em] text-[15px]">
      <span className="tabular-nums">{count(stats.snapshots)}</span> weekly
      snapshots from {monthYear(stats.firstWeek)} to {monthYear(stats.lastWeek)}
      : <span className="tabular-nums">{count(stats.coinWeeks)}</span>{" "}
      coin-weeks from <span className="tabular-nums">{count(stats.coins)}</span>{" "}
      coins, of which <span className="tabular-nums">{count(stats.gone)}</span>{" "}
      are no longer in the top 5,000.
    </p>
  );
}

async function CalibrationStrip() {
  await connection();
  const calibration = await getCalibration();
  if (!calibration) return null;
  const rotate = calibration.verdicts.rotate;
  const lagged = rotate ? 1 - rotate.beat / rotate.n : null;
  const gain = 1 - calibration.brier / calibration.brierBaseline;
  return (
    <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-end lg:gap-16">
      <p className="text-accent m-0 font-serif text-[clamp(80px,10vw,140px)] leading-[0.8]">
        {lagged === null ? "n/a" : pct(lagged)}
      </p>
      <div className="max-w-[44em]">
        <h2
          id="honest-title"
          className="mb-3 font-serif text-[28px] leading-tight"
        >
          We tested it on the past, using only what was known at the time.
        </h2>
        <p className="text-paper/80 text-[16px]">
          Every quarter from 2018, for every coin ranked 20 to 500, the tool
          gave its answer from earlier data only. When it said “rotate to BTC”,{" "}
          {lagged === null ? "" : pct(lagged)} of those coins did lag BTC over
          the next two years. The honest part: it says “rotate” most of the
          time, and it beats a plain base rate by only {pct(gain)}.{" "}
          <Link href="/method#calibration" className="link text-paper">
            See the full test
          </Link>
        </p>
      </div>
    </div>
  );
}

function SheetSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-10 w-2/3" />
      <div className="skeleton h-24 w-1/2" />
      <div className="skeleton h-28 w-full max-w-[400px]" />
      <div className="skeleton h-56 w-full" />
    </div>
  );
}
