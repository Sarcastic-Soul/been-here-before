import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { CoinSearch } from "@/components/coin-search";
import { CycleTable, PhaseTable } from "@/components/cycle-table";
import { EpisodeTable } from "@/components/episode-table";
import { LineSwatch } from "@/components/line-swatch";
import { RateBar } from "@/components/rate-bar";
import { Section } from "@/components/section";
import { ShareButton } from "@/components/share-button";
import { ReceiptDrawer } from "@/components/receipt-drawer";
import { TwinChart } from "@/components/twin-chart";
import { VerdictSummary } from "@/components/verdict-summary";
import { hasWinnerSplit, WinnersTable } from "@/components/winners-table";
import { PHASES } from "@/lib/engine/cycles";
import { median, type Rate } from "@/lib/engine/stats";
import { MIN_EPISODES } from "@/lib/engine/verdict";
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
import { addWeeks } from "@/lib/verdict/analyze";
import { FIRST_REPLAY_WEEK, thenHref } from "@/lib/verdict/cases";
import { getReceipt } from "@/lib/verdict/get-receipt";
import { getVerdictOrSaved } from "@/lib/verdict/saved";
import { shareMeta } from "@/lib/site";
import { twinLineStyle } from "@/lib/twin-style";
import { toTwinSeries } from "@/lib/verdict/twin-series";
import type { VerdictOk, VerdictRefused } from "@/lib/verdict/types";

const SLUG = /^[a-z0-9-]{1,100}$/;

export async function generateMetadata({
  params,
}: PageProps<"/coin/[slug]">): Promise<Metadata> {
  const slug = (await params).slug.toLowerCase();
  if (!SLUG.test(slug)) return { title: "Coin not found" };
  const { data } = await getVerdictOrSaved(slug);
  if (data.status === "moved" && data.movedTo)
    return { title: `Moved to ${data.movedTo.name}` };
  if (!data.coin) return { title: "Coin not found" };
  if (data.status !== "ok") return { title: data.coin.name };
  const path = `/coin/${data.coin.slug}`;
  const title = `${data.coin.name}: ${data.verdictText}`;
  if (data.verdict === "not_enough_history")
    return shareMeta(
      title,
      `Only ${data.summary.n} past coins stood in ${data.coin.name}'s spot, too few for a verdict. See the closest twins and how they did against BTC.`,
      path,
    );
  return shareMeta(
    title,
    `${data.summary.beatBtc.k} of ${data.summary.n} past coins in ${data.coin.name}'s spot beat holding BTC over 2 years (${pct(data.summary.beatBtc.p)}, 95% range ${pctRange(data.summary.beatBtc.lo, data.summary.beatBtc.hi)}).`,
    path,
  );
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
  const lower = slug.toLowerCase();
  if (lower !== slug && SLUG.test(lower)) redirect(`/coin/${lower}`);
  if (!SLUG.test(slug)) notFound();
  const { data, savedAt } = await getVerdictOrSaved(slug);
  if (data.status === "not_found") notFound();
  // Migrated coins and symbols (/coin/matic, /coin/btc) go to the live coin.
  if (data.status === "moved" && data.movedTo)
    redirect(`/coin/${data.movedTo.slug}`);
  if (data.status !== "ok") return <Refused data={data} />;
  // A saved copy means the database is down, so do not ask it for the receipt.
  const receipt = savedAt ? null : await getReceipt(data.coin.id);
  return <Verdict data={data} receipt={receipt} savedAt={savedAt} />;
}

function SavedBanner({ savedAt }: { savedAt: string }) {
  return (
    <p
      role="status"
      className="border-accent text-ink-body mt-6 border-l-2 pl-4 text-sm"
    >
      The live database did not answer in time, so this is a saved copy from{" "}
      {longDate(savedAt)}. The numbers are the same kind, just not today&apos;s.
    </p>
  );
}

function Verdict({
  data,
  receipt,
  savedAt,
}: {
  data: VerdictOk;
  receipt: Awaited<ReturnType<typeof getReceipt>>;
  savedAt: string | null;
}) {
  const { summary, state, coin } = data;
  const refused = data.verdict === "not_enough_history";
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
    <article className="appear mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-12">
      {savedAt && <SavedBanner savedAt={savedAt} />}
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
              saved={savedAt !== null}
              twins={data.twins.map((t) => ({
                name: t.episode.name,
                symbol: t.episode.symbol,
                start: t.episode.week,
              }))}
            />
            <ShareButton
              path={`/coin/${coin.slug}`}
              title={`${coin.name}: ${data.verdictText}`}
            />
            <span className="text-muted text-[13px]">
              {state.priceUsd !== null && <>Price {usd(state.priceUsd)} · </>}
              peak {state.weeksSincePeak} weeks ago
            </span>
          </div>

          {refused ? (
            <p className="border-ink text-ink-body border-t pt-4 text-[15px]">
              Rates are hidden below {MIN_EPISODES} episodes: with so few, one
              coin more or less swings them by tens of points.
            </p>
          ) : (
            <dl className="border-ink border-t">
              {outcomes.map(([label, rate]) => (
                <div
                  key={label}
                  className="border-rule flex items-center justify-between gap-4 border-b py-3"
                >
                  <dt className="text-[15px]">{label}</dt>
                  <dd className="flex items-center gap-3">
                    <RateBar rate={rate} width={84} />
                    <span className="num min-w-[104px] text-right text-sm whitespace-nowrap">
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
          {!refused && (
            <p className="text-muted mt-4 text-[13px]">
              Ranges are 95% Wilson intervals.{" "}
              {summary.beatBtc.nEff !== undefined &&
                summary.clusters !== undefined &&
                summary.beatBtc.nEff < summary.n - 0.5 && (
                  <>
                    The {count(summary.n)} episodes start in {summary.clusters}{" "}
                    half-years and partly move together, so the ranges count
                    them as about {count(Math.round(summary.beatBtc.nEff))}{" "}
                    independent ones.{" "}
                  </>
                )}
              The dot on each bar is the share; the black line is the range; the
              tick is 50%.
            </p>
          )}
          {!refused &&
            data.survivorsOnly &&
            data.survivorsOnly.n > 0 &&
            data.survivorsOnly.n < summary.n && (
              <SurvivorNote
                all={summary.beatBtc}
                survivors={data.survivorsOnly}
              />
            )}
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
              {data.twins.map((twin, index) => {
                const e = twin.episode;
                const relative = relativeToBtc(e.ret104w, e.btcRet104w);
                return (
                  <li
                    key={`${e.lineageId}-${e.week}`}
                    className="border-rule border-b py-3"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="inline-flex items-baseline gap-2 font-medium">
                        <span className="self-center">
                          <LineSwatch
                            style={twinLineStyle(index, {
                              beat: e.beatBtc104w,
                            })}
                          />
                        </span>
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

      {!refused && data.byCycle.length > 0 && (
        <Section
          id="cycles"
          title="By halving cycle"
          note="If one era carries the number, it shows here."
        >
          <CycleTable rows={data.byCycle} />
        </Section>
      )}

      {!refused && data.byPhase && data.byPhase.length > 0 && (
        <Section
          id="market"
          title="By market phase"
          note={<MarketNote data={data} />}
        >
          <PhaseTable rows={data.byPhase} current={data.market?.phase} />
          <p className="text-muted mt-4 max-w-[68ch] text-[13px]">
            Phase of the whole market in the week each episode started, from
            total market cap:{" "}
            {PHASES.map((p, i) => (
              <span key={p.phase}>
                {i > 0 && "; "}
                <span className="text-ink-body">
                  {p.label.toLowerCase()}
                </span>{" "}
                means {p.rule}
              </span>
            ))}
            . Phases are uneven in size, so a small row has a wide range.
          </p>
        </Section>
      )}

      {!refused && hasWinnerSplit(data.winners) && (
        <Section
          id="winners"
          title="What set the winners apart"
          note="Facts from each episode's start week."
        >
          <WinnersTable split={data.winners} state={state} />
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
        {state.ageWeeks >= 110 && (
          <>
            {" · "}
            <Link
              href={thenHref(coin.slug, addWeeks(data.evidence.lastWeek, -104))}
              className="link text-ink"
            >
              What would it have said 2 years ago?
            </Link>
          </>
        )}
      </p>
    </article>
  );
}

/** One line on today's whole market, next to the phase split. */
function MarketNote({ data }: { data: VerdictOk }) {
  const market = data.market;
  if (!market) return "Does the answer change with the whole market's mood?";
  const label = PHASES.find((p) => p.phase === market.phase)?.label;
  return (
    <>
      In the week of {longDate(market.week)} the whole market was in{" "}
      <span className="text-ink font-medium">{label?.toLowerCase()}</span>
      {market.marketDrawdown !== null && (
        <>, {pct(market.marketDrawdown)} below its peak</>
      )}
      {market.btcDominance !== null && (
        <>, with BTC at {pct(market.btcDominance)} of total market cap</>
      )}
      .
    </>
  );
}

/** What the same study would say if it forgot the coins that are gone. */
function SurvivorNote({ all, survivors }: { all: Rate; survivors: Rate }) {
  const gone = all.n - survivors.n;
  const gap = survivors.p - all.p;
  return (
    <div className="border-ink mt-8 border-t pt-4">
      <h2 className="mb-2 text-[15px] font-medium">
        If dead coins were left out
      </h2>
      <p className="text-ink-body text-[15px]">
        Of these {count(all.n)} past episodes, {count(survivors.n)} are coins
        still in the top 5,000 today. Counting only those,{" "}
        <b>{pct(survivors.p)}</b> beat BTC. With the {count(gone)} whose coin is
        gone counted too, it is <b>{pct(all.p)}</b>.
      </p>
      <p className="text-muted mt-2 text-[13px]">
        {gap > 0.02
          ? "Most “after a crash” charts only see coins that still exist, so they make a spot like this look better than it was."
          : gap < -0.02
            ? "Here leaving them out would look worse, not better: some coins beat BTC over their two years and only dropped out later."
            : "Here it barely changes the answer. Dead coins matter most further down the rankings."}
      </p>
    </div>
  );
}

function Refused({ data }: { data: VerdictRefused }) {
  const title =
    data.status === "benchmark"
      ? "Bitcoin is the yardstick."
      : data.status === "excluded"
        ? "Not ranked: it tracks another asset."
        : data.lastSeen
          ? "Gone from the top 5,000."
          : "Outside what we cover.";
  return (
    <article className="appear mx-auto max-w-[1360px] px-4 py-14 sm:px-8 lg:px-12">
      <p className="text-muted text-[13px]">
        {data.coin?.name} <span className="num">({data.coin?.symbol})</span>
      </p>
      <h1 className="mt-2 mb-4 max-w-[18em] font-serif text-[clamp(34px,4vw,52px)] leading-[1.05] tracking-[-0.02em]">
        {title}
      </h1>
      <p className="text-ink-body mb-10 max-w-[38em] text-[17px]">
        {data.message}
      </p>
      {data.coin && data.lastSeen && (
        <ReplayLink slug={data.coin.slug} lastSeen={data.lastSeen} />
      )}
      <h2 className="label mb-3">Try another coin</h2>
      <CoinSearch size="md" />
    </article>
  );
}

/** For a coin that is gone: replay the verdict half a year before it vanished. */
function ReplayLink({ slug, lastSeen }: { slug: string; lastSeen: string }) {
  const week = addWeeks(lastSeen, -26);
  if (week < FIRST_REPLAY_WEEK) return null;
  return (
    <p className="text-ink-body -mt-6 mb-10 max-w-[38em] text-[17px]">
      <Link href={thenHref(slug, week)} className="link text-ink">
        What would this site have said in {monthYear(week)}, half a year before
        it vanished?
      </Link>
    </p>
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
