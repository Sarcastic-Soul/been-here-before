import {
  CheckCircle,
  MinusCircle,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { CycleTable, PhaseTable } from "@/components/cycle-table";
import { Section } from "@/components/section";
import { TwinChart } from "@/components/twin-chart";
import { VerdictSummary } from "@/components/verdict-summary";
import { hasWinnerSplit, WinnersTable } from "@/components/winners-table";
import { PHASES } from "@/lib/engine/cycles";
import { count, longDate, pct, relativeToBtc, signedPct } from "@/lib/format";
import { thenHref } from "@/lib/verdict/cases";
import {
  getPastVerdict,
  snapToSunday,
  type PastOk,
  type PastRefused,
} from "@/lib/verdict/get-past-verdict";
import { toTwinSeries } from "@/lib/verdict/twin-series";

const SLUG = /^[a-z0-9-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validDay(day: string) {
  return DAY.test(day) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`));
}

export async function generateMetadata({
  params,
}: PageProps<"/then/[slug]/[week]">): Promise<Metadata> {
  const { slug, week } = await params;
  if (!SLUG.test(slug) || !validDay(week)) return { title: "Time machine" };
  const data = await getPastVerdict(slug, snapToSunday(week));
  if (data.status !== "ok")
    return { title: `${data.coin?.name ?? "Coin"} on ${longDate(week)}` };
  const { verdict, actual } = data;
  return {
    title: `${verdict.coin.name} on ${longDate(data.asOf)}: ${verdict.verdictText}`,
    description: `What Been Here Before would have said about ${verdict.coin.name} in the week of ${longDate(data.asOf)}, using only history known then${actual.ret104w !== null ? `, and what really happened: ${signedPct(actual.ret104w)} over the next 2 years` : ""}.`,
  };
}

export default function ThenPage({ params }: PageProps<"/then/[slug]/[week]">) {
  return (
    <Suspense fallback={<ThenSkeleton />}>
      {params.then(({ slug, week }) => (
        <PastVerdict slug={slug} week={week} />
      ))}
    </Suspense>
  );
}

async function PastVerdict({ slug, week }: { slug: string; week: string }) {
  const lower = slug.toLowerCase();
  if (!SLUG.test(lower) || !validDay(week)) notFound();
  const sunday = snapToSunday(week);
  if (lower !== slug || sunday !== week) redirect(thenHref(lower, sunday));
  const data = await getPastVerdict(slug, week);
  if (data.status === "not_found") notFound();
  if (data.status !== "ok") return <Refused data={data} week={week} />;
  return <Replay data={data} />;
}

/** Did the call hold up? Only rotate and hold make a call that can be checked. */
function callResult(data: PastOk): "right" | "wrong" | "none" | "open" {
  const { verdict } = data.verdict;
  if (verdict !== "rotate" && verdict !== "hold") return "none";
  if (data.actual.beatBtc104w === null) return "open";
  const right =
    verdict === "hold" ? data.actual.beatBtc104w : !data.actual.beatBtc104w;
  return right ? "right" : "wrong";
}

function Replay({ data }: { data: PastOk }) {
  const { verdict, actual } = data;
  const { coin } = verdict;
  const result = callResult(data);
  const relative =
    actual.ret104w === null
      ? null
      : relativeToBtc(actual.ret104w, actual.btcRet104w);
  const lastPoint = actual.path.at(-1);
  const series = [
    ...toTwinSeries(verdict.twins),
    ...(actual.path.length > 0
      ? [
          {
            key: "own",
            name: coin.name,
            symbol: coin.symbol,
            start: data.asOf,
            beat: actual.beatBtc104w ?? false,
            path: actual.path,
            own: true,
          },
        ]
      : []),
  ];
  const refused = verdict.verdict === "not_enough_history";
  const phaseLabel = data.market
    ? PHASES.find((p) => p.phase === data.market?.phase)?.label
    : null;

  return (
    <article className="appear mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-12">
      <p className="text-muted pt-8 text-[13px]">
        <Link href="/then" className="link text-ink">
          Time machine
        </Link>{" "}
        · replayed with only the history known in the week of{" "}
        {longDate(data.asOf)}
      </p>
      <div className="grid gap-10 pt-6 pb-12 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
        <div className="rise">
          <VerdictSummary data={verdict} />
        </div>

        <aside aria-labelledby="what-happened" className="rise [--i:2] lg:pt-1">
          <h2
            id="what-happened"
            className="border-ink border-b pb-2.5 font-serif text-[26px] leading-tight"
          >
            What happened next
          </h2>
          {actual.complete && actual.ret104w !== null ? (
            <>
              <p className="mt-5 mb-1 font-serif text-[clamp(56px,6vw,80px)] leading-[0.9]">
                {relative === null ? "n/a" : signedPct(relative)}
              </p>
              <p className="text-ink-body text-[15px]">
                against simply holding BTC over the next 2 years.
              </p>
              <dl className="border-rule mt-5 border-t">
                <Fact label={`${coin.symbol} price change`}>
                  {signedPct(actual.ret104w)}
                </Fact>
                {actual.btcRet104w !== null && (
                  <Fact label="BTC price change">
                    {signedPct(actual.btcRet104w)}
                  </Fact>
                )}
                <Fact label="Fell out of the top 5,000">
                  {actual.fellOut104w ? "yes" : "no"}
                </Fact>
                <Fact label="Back in the top 20">
                  {actual.reachedTop20 ? "yes" : "no"}
                </Fact>
              </dl>
            </>
          ) : (
            <p className="text-ink-body mt-5 text-[15px]">
              Less than 2 years have passed, so the outcome is not finished.
              {lastPoint && (
                <>
                  {" "}
                  So far, {lastPoint.t} weeks in, it is{" "}
                  <b>{signedPct(lastPoint.vsBtc / 100 - 1)}</b> against BTC.
                </>
              )}
            </p>
          )}
          <CallCheck result={result} verdictText={verdict.verdictText} />
        </aside>
      </div>

      {series.length > 0 && (
        <Section
          id="paths"
          title={
            refused
              ? "Its closest twins, and what it really did"
              : "Its five closest twins, and what it really did"
          }
          note="Price divided by BTC, 100 at the start, log scale."
        >
          <TwinChart twins={series} />
        </Section>
      )}

      {!refused && verdict.byPhase && verdict.byPhase.length > 0 && (
        <Section
          id="market"
          title="By market phase"
          note={
            phaseLabel && data.market ? (
              <>
                That week the whole market was in{" "}
                <span className="text-ink font-medium">
                  {phaseLabel.toLowerCase()}
                </span>
                {data.market.marketDrawdown !== null && (
                  <>, {pct(data.market.marketDrawdown)} below its peak</>
                )}
                .
              </>
            ) : undefined
          }
        >
          <PhaseTable
            rows={verdict.byPhase}
            current={data.market?.phase}
            currentNote="then"
          />
        </Section>
      )}

      {!refused && hasWinnerSplit(verdict.winners) && (
        <Section
          id="winners"
          title="What set the winners apart"
          note="Only episodes already finished that week."
        >
          <WinnersTable
            split={verdict.winners}
            state={verdict.state}
            stateLabel={`${coin.symbol} that week`}
          />
        </Section>
      )}

      {!refused && verdict.byCycle.length > 0 && (
        <Section id="cycles" title="By halving cycle">
          <CycleTable rows={verdict.byCycle} />
        </Section>
      )}

      <p className="border-rule text-muted border-t py-6 text-[13px]">
        Only the {count(verdict.summary.n)} episodes that started on or before{" "}
        {longDate(data.cutoff)} count, so every outcome used was already known
        in the week of {longDate(data.asOf)}. Rank, drop and age come from that
        week&apos;s CoinMarketCap snapshot. Which coins are still alive today is
        left out, because nobody knew it then.{" "}
        <Link href={`/coin/${coin.slug}`} className="link text-ink">
          {coin.name} today
        </Link>
        {" · "}
        <Link href="/method#calibration" className="link text-ink">
          How often the calls held up
        </Link>
      </p>
    </article>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-rule flex items-baseline justify-between gap-4 border-b py-2.5">
      <dt className="text-[15px]">{label}</dt>
      <dd className="num text-sm">{children}</dd>
    </div>
  );
}

function CallCheck({
  result,
  verdictText,
}: {
  result: ReturnType<typeof callResult>;
  verdictText: string;
}) {
  const [Icon, title, body] =
    result === "right"
      ? [
          CheckCircle,
          "The call held up.",
          `"${verdictText}" matched what happened.`,
        ]
      : result === "wrong"
        ? [
            XCircle,
            "The call was wrong.",
            `"${verdictText}" did not match what happened. A base rate is a lean, not a promise, and this is one of the misses.`,
          ]
        : result === "open"
          ? [
              MinusCircle,
              "Too early to check.",
              "The 2 years are not over yet.",
            ]
          : [
              MinusCircle,
              "No call to check.",
              "The site would not have leaned either way here, so there is nothing to score.",
            ];
  return (
    <div className="border-ink mt-6 flex gap-3 border-t pt-4">
      <Icon
        size={22}
        weight="bold"
        aria-hidden
        className={
          result === "right"
            ? "text-ink shrink-0"
            : result === "wrong"
              ? "text-accent-text shrink-0"
              : "text-muted shrink-0"
        }
      />
      <p className="text-ink-body text-[15px]">
        <b className="text-ink">{title}</b> {body}
      </p>
    </div>
  );
}

function Refused({ data, week }: { data: PastRefused; week: string }) {
  return (
    <article className="appear mx-auto max-w-[1360px] px-4 py-14 sm:px-8 lg:px-12">
      <p className="text-muted text-[13px]">
        <Link href="/then" className="link text-ink">
          Time machine
        </Link>{" "}
        · week of {longDate(week)}
      </p>
      <h1 className="mt-2 mb-4 max-w-[18em] font-serif text-[clamp(34px,4vw,52px)] leading-[1.05] tracking-[-0.02em]">
        Nothing to replay.
      </h1>
      <p className="text-ink-body mb-10 max-w-[38em] text-[17px]">
        {data.message}
      </p>
      <Link href="/then" className="link text-ink">
        Pick another coin or week
      </Link>
    </article>
  );
}

function ThenSkeleton() {
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
        </div>
        <div className="space-y-3">
          <div className="skeleton h-11 w-40" />
          <div className="skeleton h-40 w-full" />
        </div>
      </div>
      <div className="skeleton mt-12 h-72 w-full" />
    </div>
  );
}
