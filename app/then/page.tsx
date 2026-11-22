import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { ThenForm } from "@/components/then-form";
import { longDate, relativeToBtc, signedPct } from "@/lib/format";
import { FAMOUS_CASES, FIRST_REPLAY_WEEK, thenHref } from "@/lib/verdict/cases";
import { getPastVerdict } from "@/lib/verdict/get-past-verdict";

export const metadata: Metadata = {
  title: "Time machine",
  description:
    "Replay Been Here Before on any past week, using only the history known then, and see what really happened next. LUNA before the collapse, FTT before FTX failed, and more.",
};

export default function ThenIndex() {
  return (
    <article className="mx-auto max-w-[1360px] px-4 pb-16 sm:px-8 lg:px-12">
      <div className="grid gap-10 pt-12 pb-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <p className="label mb-3">Time machine</p>
          <h1 className="font-serif text-[clamp(36px,4.4vw,58px)] leading-[1.04] tracking-[-0.02em]">
            What would it have said back then?
          </h1>
          <p className="text-ink-body mt-5 max-w-[34em] text-[17px]">
            Pick a coin and a past week. The site replays its verdict using only
            coins whose 2-year outcome was already known that week, then shows
            what really happened. It is the same test as the{" "}
            <Link href="/method#calibration" className="link text-ink">
              calibration
            </Link>
            , one coin at a time.
          </p>
        </div>
        <div className="lg:pt-10">
          <ThenForm min={FIRST_REPLAY_WEEK} />
          <p className="text-muted mt-3 text-[13px]">
            Any Sunday from {longDate(FIRST_REPLAY_WEEK)} on. Other days snap to
            the Sunday before.
          </p>
        </div>
      </div>

      <section aria-labelledby="cases" className="border-ink border-t pt-8">
        <h2
          id="cases"
          className="mb-5 font-serif text-[26px] leading-tight tracking-[-0.01em]"
        >
          Famous moments, replayed
        </h2>
        <Suspense fallback={<CasesSkeleton />}>
          <Cases />
        </Suspense>
      </section>
    </article>
  );
}

async function Cases() {
  await connection();
  const results = await Promise.all(
    FAMOUS_CASES.map(async (c) => ({
      c,
      data: await getPastVerdict(c.slug, c.week).catch(() => null),
    })),
  );
  const scored = results.map(({ c, data }) => {
    const ok = data?.status === "ok" ? data : null;
    const actual = ok?.actual;
    const call = ok?.verdict.verdict;
    return {
      c,
      ok,
      actual,
      relative:
        actual?.ret104w != null
          ? relativeToBtc(actual.ret104w, actual.btcRet104w)
          : null,
      checked:
        ok &&
        actual?.beatBtc104w != null &&
        (call === "rotate" || call === "hold")
          ? (call === "hold") === actual.beatBtc104w
          : null,
    };
  });
  const right = scored.filter((r) => r.checked === true).length;
  const wrong = scored.filter((r) => r.checked === false).length;
  const none = scored.filter((r) => r.ok && r.checked === null).length;
  return (
    <>
      <p className="text-ink-body mb-6 max-w-[44em] text-[15px]">
        Picked because they are famous, not because they flatter the method:{" "}
        {right} {right === 1 ? "call held" : "calls held"} up, {none}{" "}
        {none === 1 ? "case got" : "cases got"} no call either way, and {wrong}{" "}
        {wrong === 1 ? "call was" : "calls were"} wrong. A base rate says what
        usually happens to coins in a spot. It cannot see a fraud or a broken
        design coming, and it will miss the rare coin that runs.
      </p>
      <ol className="border-ink border-t">
        {scored.map(({ c, ok, relative, checked, actual }) => {
          return (
            <li key={`${c.slug}-${c.week}`} className="border-rule border-b">
              <Link
                href={thenHref(c.slug, c.week)}
                className="hover:bg-paper-raised grid gap-x-8 gap-y-2 py-5 sm:px-3 md:grid-cols-[1.3fr_1.4fr_0.8fr]"
              >
                <span>
                  <span className="block font-medium">{c.name}</span>
                  <span className="text-muted num block text-[13px]">
                    week of {longDate(c.week)}
                  </span>
                  <span className="text-ink-body mt-1 block text-[14px]">
                    {c.story}
                  </span>
                </span>
                <span className="text-[15px]">
                  <span className="text-muted block text-[12px]">
                    It would have said
                  </span>
                  {ok ? (
                    <>
                      <span className="font-serif text-[20px] leading-snug">
                        {ok.verdict.verdict === "not_enough_history"
                          ? "Not enough history"
                          : ok.verdict.verdictText}
                      </span>
                      {ok.verdict.verdict !== "not_enough_history" && (
                        <span className="text-muted num block text-[13px]">
                          {ok.verdict.summary.beatBtc.k} of{" "}
                          {ok.verdict.summary.beatBtc.n} past episodes beat BTC
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">unavailable</span>
                  )}
                </span>
                <span className="text-[15px] md:text-right">
                  <span className="text-muted block text-[12px]">
                    Then, against BTC
                  </span>
                  <span className="num font-serif text-[24px]">
                    {relative === null ? "n/a" : signedPct(relative)}
                  </span>
                  {checked !== null && (
                    <span
                      className={`block text-[13px] font-medium ${checked ? "text-ink" : "text-accent-text"}`}
                    >
                      {checked ? "Call held up" : "Call was wrong"}
                    </span>
                  )}
                  {ok && checked === null && actual?.complete && (
                    <span className="text-muted block text-[13px]">
                      No call to score
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function CasesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3">
      {FAMOUS_CASES.map((c) => (
        <div key={c.slug} className="skeleton h-24 w-full" />
      ))}
    </div>
  );
}
