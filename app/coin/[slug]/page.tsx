import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CoinSearch } from "@/components/coin-search";
import { CycleTable } from "@/components/cycle-table";
import { EpisodeTable } from "@/components/episode-table";
import { RateBar } from "@/components/rate-bar";
import { ReceiptDrawer } from "@/components/receipt-drawer";
import { TwinChart } from "@/components/twin-chart";
import { VerdictSummary } from "@/components/verdict-summary";
import { median, type Rate } from "@/lib/engine/stats";
import {
  count,
  drawdownPct,
  longDate,
  monthYear,
  pct,
  pctRange,
  relativeToBtc,
  signedPct,
  usd,
} from "@/lib/format";
import { getReceipt } from "@/lib/verdict/get-receipt";
import { getVerdict } from "@/lib/verdict/get-verdict";
import { toTwinSeries } from "@/lib/verdict/twin-series";
import type { VerdictOk, VerdictRefused } from "@/lib/verdict/types";

const SLUG = /^[a-z0-9-]{1,100}$/;

export async function generateMetadata({
  params,
}: PageProps<"/coin/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG.test(slug)) return { title: "Coin not found" };
  const data = await getVerdict(slug);
  if (!data.coin) return { title: "Coin not found" };
  if (data.status !== "ok") return { title: data.coin.name };
  return {
    title: `${data.coin.name}: ${data.verdictText}`,
    description: `${data.summary.beatBtc.k} of ${data.summary.n} past coins in ${data.coin.name}'s spot beat holding BTC over 2 years (${pct(data.summary.beatBtc.p)}, 95% range ${pctRange(data.summary.beatBtc.lo, data.summary.beatBtc.hi)}).`,
  };
}

export default function CoinPage({ params }: PageProps<"/coin/[slug]">) {
  return (
    <Suspense fallback={<CoinSkeleton />}>
      {params.then(({ slug }) => (
        <CoinVerdict slug={slug} />
      ))}
    </Suspense>
  );
}

async function CoinVerdict({ slug }: { slug: string }) {
  if (!SLUG.test(slug)) notFound();
  const data = await getVerdict(slug);
  if (data.status === "not_found") notFound();
  if (data.status !== "ok") return <Refused data={data} />;
  const receipt = await getReceipt(data.coin.id);
  return <Verdict data={data} receipt={receipt} />;
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-ink border-t py-10">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2
          id={id}
          className="font-serif text-[26px] leading-tight tracking-[-0.01em]"
        >
          {title}
        </h2>
        {note && <p className="text-muted text-[13px]">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Verdict({
  data,
  receipt,
}: {
  data: VerdictOk;
  receipt: Awaited<ReturnType<typeof getReceipt>>;
}) {
  const { summary, state, coin } = data;
  const relatives = data.episodes
    .map((e) => relativeToBtc(e.ret104w, e.btcRet104w))
    .filter((v): v is number => v !== null);
  const medianRelative = median(relatives);
  const outcomes: [string, Rate][] = [
    ["Beat BTC over 1 year", data.beatBtc1y],
    ["Back in the top 20 within 2 years", summary.reachedTop20],
    ["Fell out of the top 5,000 within 2 years", summary.fellOut],
  ];

  return (
    <article className="mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-12">
      <div className="grid gap-10 pt-10 pb-12 lg:grid-cols-[1.35fr_1fr] lg:gap-16 lg:pt-12">
        <div className="rise">
          <VerdictSummary data={data} />
        </div>

        <aside aria-label="More outcomes" className="rise [--i:2] lg:pt-1">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <ReceiptDrawer
              slug={coin.slug}
              coinName={coin.name}
              evidence={data.evidence}
              receipt={receipt}
              twins={data.twins.map((t) => ({
                name: t.episode.name,
                symbol: t.episode.symbol,
                start: t.episode.week,
              }))}
            />
            <span className="text-muted text-[13px]">
              Price {usd(state.priceUsd)} · peak {state.weeksSincePeak} weeks
              ago
            </span>
          </div>

          {summary.n > 0 && (
            <dl className="border-ink border-t">
              {outcomes.map(([label, rate]) => (
                <div
                  key={label}
                  className="border-rule flex items-center justify-between gap-4 border-b py-3"
                >
                  <dt className="text-[15px]">{label}</dt>
                  <dd className="flex items-center gap-3">
                    <RateBar rate={rate} width={84} />
                    <span className="num w-[92px] text-right text-sm">
                      {pct(rate.p)}{" "}
                      <span className="text-muted text-xs">
                        {pctRange(rate.lo, rate.hi)}
                      </span>
                    </span>
                  </dd>
                </div>
              ))}
              <div className="border-rule flex items-baseline justify-between gap-4 border-b py-3">
                <dt className="text-[15px]">Median 2-year price change</dt>
                <dd className="num text-sm">
                  {summary.medianCoinReturn === null
                    ? "n/a"
                    : signedPct(summary.medianCoinReturn)}
                </dd>
              </div>
              <div className="border-rule flex items-baseline justify-between gap-4 border-b py-3">
                <dt className="text-[15px]">Median result against BTC</dt>
                <dd className="num text-sm">
                  {medianRelative === null ? "n/a" : signedPct(medianRelative)}
                </dd>
              </div>
            </dl>
          )}
          <p className="text-muted mt-4 text-[13px]">
            Ranges are Wilson 95% intervals. The dot on each bar is the share;
            the black line is the range; the tick is 50%.
          </p>
        </aside>
      </div>

      {data.twins.length > 0 && (
        <Section
          id="twins"
          title="The five closest twins"
          note="Closest in rank, drop and age. Price divided by BTC, 100 at the start, log scale."
        >
          <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
            <TwinChart twins={toTwinSeries(data.twins)} />
            <ol className="border-rule border-t">
              {data.twins.map((twin) => {
                const e = twin.episode;
                const relative = relativeToBtc(e.ret104w, e.btcRet104w);
                return (
                  <li
                    key={`${e.lineageId}-${e.week}`}
                    className="border-rule border-b py-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">
                        {e.name}{" "}
                        <span className="num text-muted text-xs">
                          {e.symbol}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm">
                        {relative === null ? (
                          "n/a"
                        ) : (
                          <>
                            <span
                              className={`num ${e.beatBtc104w ? "text-accent-text" : ""}`}
                            >
                              {signedPct(relative)}
                            </span>{" "}
                            <span className="text-muted">vs BTC</span>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-muted text-[13px]">
                      {monthYear(e.week)}: rank {e.rankAdj}, down{" "}
                      {drawdownPct(e.drawdown)}
                      {e.fellOut104w ? ", then fell out" : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </Section>
      )}

      {data.byCycle.length > 0 && (
        <Section
          id="cycles"
          title="By halving cycle"
          note="If one era carries the number, it shows here."
        >
          <CycleTable rows={data.byCycle} />
        </Section>
      )}

      {data.episodes.length > 0 && (
        <Section
          id="episodes"
          title={`All ${count(data.episodes.length)} past episodes`}
          note="One per coin per halving cycle: the first week it entered the spot."
        >
          <details className="group">
            <summary className="border-ink hover:bg-ink hover:text-paper inline-flex min-h-11 cursor-pointer items-center gap-2 border px-4 text-sm font-medium select-none">
              <span className="group-open:hidden">Show the table</span>
              <span className="hidden group-open:inline">Hide the table</span>
            </summary>
            <div className="mt-5 max-h-[640px] overflow-y-auto">
              <EpisodeTable episodes={data.episodes} />
            </div>
          </details>
        </Section>
      )}

      <p className="border-rule text-muted border-t py-6 text-[13px]">
        Today’s state: CoinMarketCap {data.evidence.stateEndpoint},{" "}
        {longDate(data.evidence.stateSnapshot)}. History: weekly{" "}
        {data.evidence.historyEndpoint} snapshots from{" "}
        {longDate(data.evidence.firstWeek)} to{" "}
        {longDate(data.evidence.lastWeek)}. A base rate from past coins, not a
        forecast for this one.{" "}
        <Link href="/method" className="link text-ink">
          Method and limits
        </Link>
      </p>
    </article>
  );
}

function Refused({ data }: { data: VerdictRefused }) {
  const title =
    data.status === "benchmark"
      ? "Bitcoin is the yardstick."
      : data.status === "excluded"
        ? "Not ranked: it tracks another asset."
        : "Outside what we cover.";
  return (
    <article className="mx-auto max-w-[1360px] px-4 py-14 sm:px-8 lg:px-12">
      <p className="text-muted text-[13px]">
        {data.coin?.name} <span className="num">({data.coin?.symbol})</span>
      </p>
      <h1 className="mt-2 mb-4 max-w-[18em] font-serif text-[clamp(34px,4vw,52px)] leading-[1.05] tracking-[-0.02em]">
        {title}
      </h1>
      <p className="text-ink-body mb-10 max-w-[38em] text-[17px]">
        {data.message}
      </p>
      <h2 className="label mb-3">Try another coin</h2>
      <CoinSearch size="md" />
    </article>
  );
}

function CoinSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="mx-auto max-w-[1360px] px-4 pt-10 sm:px-8 lg:px-12"
    >
      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
        <div className="space-y-4">
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-11 w-2/3" />
          <div className="skeleton h-24 w-1/2" />
          <div className="skeleton h-28 w-full max-w-[400px]" />
        </div>
        <div className="space-y-3">
          <div className="skeleton h-11 w-32" />
          <div className="skeleton h-40 w-full" />
        </div>
      </div>
      <div className="skeleton mt-12 h-72 w-full" />
    </div>
  );
}
