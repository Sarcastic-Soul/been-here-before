import Link from "next/link";

import { MIN_EPISODES } from "@/lib/engine/verdict";
import {
  count,
  drawdownPct,
  longDate,
  pct,
  pctRange,
  years,
} from "@/lib/format";
import type { VerdictOk } from "@/lib/verdict/types";

import { EpisodeDots } from "./episode-dots";

/** Headline block: who the coin is today, the verdict, and the count behind it. */
export function VerdictSummary({
  data,
  headingLevel = 1,
}: {
  data: VerdictOk;
  headingLevel?: 1 | 2;
}) {
  const { coin, state, summary, verdict } = data;
  const { beatBtc } = summary;
  const refused = verdict === "not_enough_history";
  const Heading = headingLevel === 1 ? "h1" : "h2";

  return (
    <div>
      <div className="border-rule text-muted flex flex-wrap justify-between gap-x-6 gap-y-1 border-b pb-2.5 text-[13px]">
        <span>
          {coin.name} <span className="num">({coin.symbol})</span> · rank{" "}
          {state.rankAdj} · down {drawdownPct(state.drawdown)} from its peak ·
          listed {years(state.ageWeeks)} ago
        </span>
        <span className="num">as of {longDate(state.asOf)}</span>
      </div>

      <Heading className="mt-5 mb-1 font-serif text-[clamp(30px,3.4vw,42px)] leading-[1.08] font-normal tracking-[-0.015em]">
        {refused ? "Not enough history to say." : `${data.verdictText}.`}
      </Heading>

      {refused ? (
        <p className="text-ink-body mt-4 max-w-[34em] text-[15px]">
          Only <b>{summary.n}</b> past{" "}
          {summary.n === 1 ? "episode matches" : "episodes match"} this spot. We
          give a verdict from {MIN_EPISODES} upward, so here are the closest
          twins without one.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-x-7 gap-y-3">
          <p className="text-accent m-0 font-serif text-[clamp(72px,8vw,104px)] leading-[0.82]">
            {beatBtc.k}
            <span className="text-ink text-[0.38em]">
              {" "}
              of {count(beatBtc.n)}
            </span>
          </p>
          <p className="text-ink-body m-0 max-w-[21em] text-[15px]">
            past episodes like this beat holding BTC over the next 2 years. That
            is <b>{pct(beatBtc.p)}</b>, with a 95% range of{" "}
            <span className="num">{pctRange(beatBtc.lo, beatBtc.hi)}</span>,
            from {count(summary.distinctCoins)} different coins.
          </p>
        </div>
      )}

      {data.episodes.length > 0 && (
        <div className="mt-6">
          <EpisodeDots episodes={data.episodes} />
        </div>
      )}

      <p className="text-muted mt-5 text-[13px]">
        Matched on rank {data.bands.rankMin} to {data.bands.rankMax},{" "}
        {pct(data.bands.drawdownMin)} to {pct(data.bands.drawdownMax)} below the
        peak so far, and listed {data.bands.ageLabel}.{" "}
        <Link href="/method#same-spot" className="link text-ink">
          How matching works
        </Link>
      </p>
    </div>
  );
}
