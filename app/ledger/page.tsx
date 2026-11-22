import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { LedgerVerify } from "@/components/ledger-verify";
import { VERDICT_TEXT } from "@/lib/engine/verdict";
import { count, drawdownPct, longDate, pctRange } from "@/lib/format";
import { addWeeks, HORIZON_WEEKS } from "@/lib/verdict/analyze";
import type { LedgerLine } from "@/lib/ledger/chain";
import { getLedgerDay, getLedgerDays } from "@/lib/ledger/read";

export const metadata: Metadata = {
  title: "Prediction ledger",
  description:
    "Every day Been Here Before writes down its verdict for the top 100 coins and chains the day's hash to the one before, so the calls can be checked in 2 years and cannot be quietly changed.",
};

const ORDER = [
  "rotate",
  "hold",
  "no_clear_edge",
  "not_enough_history",
] as const;

/** Short labels for the table and the tally. */
const SHORT: Record<(typeof ORDER)[number], string> = {
  rotate: "Rotate to BTC",
  hold: "Hold",
  no_clear_edge: "No clear edge",
  not_enough_history: "Not enough history",
};

export default function LedgerPage() {
  return (
    <article className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8 lg:px-12">
      <div className="grid gap-10 pt-12 pb-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <p className="label mb-3">Prediction ledger</p>
          <h1 className="font-serif text-[clamp(36px,4.4vw,58px)] leading-[1.04] tracking-[-0.02em]">
            Written down today, checked in 2 years.
          </h1>
          <p className="text-ink-body mt-5 max-w-[34em] text-[17px]">
            The calibration test replays the past. This is the forward test.
            Every day, right after the CoinMarketCap refresh, the site writes
            down its verdict for the top 100 coins (BTC is the yardstick, so it
            gets none). Each day&apos;s lines are hashed, and that hash is
            chained to the day before, so no old call can be changed without
            breaking every day after it.
          </p>
        </div>
        <div className="text-ink-body text-[15px] lg:pt-10">
          <p className="mb-4">
            How the chain works: the day&apos;s lines are sorted and joined, and
            hashed with SHA-256. The day&apos;s root is the SHA-256 of the
            previous root, the date and that hash. The first day starts from the
            word &ldquo;genesis&rdquo;. Save a root today and you can prove
            later that nothing before it moved.
          </p>
          <LedgerVerify />
        </div>
      </div>
      <Suspense fallback={<div className="skeleton h-96 w-full" />}>
        <Ledger />
      </Suspense>
    </article>
  );
}

async function Ledger() {
  await connection();
  const days = await getLedgerDays().catch(() => null);
  if (days === null)
    return (
      <p className="text-muted border-ink border-t pt-8">
        The ledger did not load. Try again in a minute.
      </p>
    );
  if (days.length === 0)
    return (
      <p className="text-muted border-ink border-t pt-8">
        The first day is written after the next daily refresh.
      </p>
    );
  const first = days.at(-1)!;
  const latest = await getLedgerDay(days[0].day);
  const lines = (latest?.lines ?? [])
    .map((line) => JSON.parse(line) as LedgerLine)
    .sort((a, b) => a.rank - b.rank);
  const tally = ORDER.map((kind) => ({
    kind,
    n: lines.filter((line) => line.verdict === kind).length,
  })).filter((row) => row.n > 0);
  const totalLines = days.reduce((sum, day) => sum + day.count, 0);

  return (
    <>
      <dl className="border-ink grid grid-cols-2 gap-x-8 gap-y-5 border-t py-8 md:grid-cols-4">
        <Stat label="Days written">{count(days.length)}</Stat>
        <Stat label="Calls on record">{count(totalLines)}</Stat>
        <Stat label="First day">{longDate(first.day)}</Stat>
        <Stat label="First calls can be checked">
          {longDate(addWeeks(first.day, HORIZON_WEEKS))}
        </Stat>
      </dl>

      <section aria-labelledby="latest" className="border-ink border-t py-10">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2
            id="latest"
            className="font-serif text-[26px] leading-tight tracking-[-0.01em]"
          >
            {longDate(days[0].day)}
          </h2>
          <p className="text-muted text-[13px]">
            {tally
              .map(
                (row) =>
                  `${row.n} ${SHORT[row.kind].toLowerCase().replace("btc", "BTC")}`,
              )
              .join(" · ")}
          </p>
        </div>
        <p className="text-muted mb-5 text-[13px] break-all">
          Root <span className="num text-ink">{days[0].root}</span>
        </p>
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <caption className="sr-only">
              Verdicts written to the ledger on {longDate(days[0].day)}
            </caption>
            <thead className="bg-paper sticky top-0">
              <tr className="text-muted text-left text-xs">
                <th
                  scope="col"
                  className="border-ink border-b py-2 font-medium"
                >
                  Rank
                </th>
                <th
                  scope="col"
                  className="border-ink border-b py-2 font-medium"
                >
                  Coin
                </th>
                <th
                  scope="col"
                  className="border-ink border-b py-2 font-medium"
                >
                  Verdict
                </th>
                <th
                  scope="col"
                  className="border-ink border-b py-2 text-right font-medium"
                >
                  Beat BTC
                </th>
                <th
                  scope="col"
                  className="border-ink border-b py-2 text-right font-medium"
                >
                  Drop from peak
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.slug}>
                  <td className="num border-rule border-b py-2">{line.rank}</td>
                  <th
                    scope="row"
                    className="border-rule border-b py-2 text-left font-normal"
                  >
                    <Link href={`/coin/${line.slug}`} className="link">
                      {line.symbol}
                    </Link>
                  </th>
                  <td
                    className={`border-rule border-b py-2 ${line.verdict === "rotate" || line.verdict === "hold" ? "text-ink font-medium" : "text-muted"}`}
                  >
                    <span title={VERDICT_TEXT[line.verdict]}>
                      {SHORT[line.verdict]}
                    </span>
                  </td>
                  <td className="num border-rule border-b py-2 text-right whitespace-nowrap">
                    {line.n > 0 ? (
                      <>
                        {line.k} of {line.n}{" "}
                        <span className="text-muted">
                          ({pctRange(line.lo, line.hi)})
                        </span>
                      </>
                    ) : (
                      "n/a"
                    )}
                  </td>
                  <td className="num border-rule border-b py-2 text-right">
                    {drawdownPct(line.drawdown)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="chain" className="border-ink border-t py-10">
        <h2
          id="chain"
          className="mb-5 font-serif text-[26px] leading-tight tracking-[-0.01em]"
        >
          The chain
        </h2>
        <ol className="border-ink border-t">
          {days.map((day) => (
            <li
              key={day.day}
              className="border-rule grid gap-x-6 gap-y-1 border-b py-3 text-sm sm:grid-cols-[10em_6em_1fr]"
            >
              <span>{longDate(day.day)}</span>
              <span className="text-muted num">{day.count} lines</span>
              <a
                href={`/api/ledger?day=${day.day}`}
                className="link num text-muted truncate"
              >
                {day.root}
              </a>
            </li>
          ))}
        </ol>
        <p className="text-muted mt-4 text-[13px]">
          Raw data:{" "}
          <a href="/api/ledger" className="link text-ink">
            /api/ledger
          </a>{" "}
          lists every day; <span className="num">?day=YYYY-MM-DD</span> returns
          the exact lines that were hashed. The verdicts use the same rules as
          the coin pages, and scoring starts when the first calls turn 2 years
          old.
        </p>
      </section>
    </>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-muted text-[12px]">{label}</dt>
      <dd className="num mt-1 font-serif text-[24px] leading-tight">
        {children}
      </dd>
    </div>
  );
}
