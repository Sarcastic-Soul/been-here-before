import {
  bandOfRank,
  benchmarkSentence,
  type Benchmark,
} from "@/lib/verdict/get-benchmark";
import { count, pct, signedPct } from "@/lib/format";

interface Row {
  key: string;
  label: string;
  n: number;
  share: number | null;
  medianRelative: number | null;
  here: boolean;
  total: boolean;
}

/**
 * How hard BTC is to beat: the share of coin-weeks that beat holding BTC over
 * the next 2 years, by rank band. Pass the coin's adjusted `rank` to mark its
 * band. Plain divs, no chart library. Server component: needs no client code.
 */
export function BenchmarkPanel({
  data,
  rank,
}: {
  data: Benchmark;
  rank?: number | null;
}) {
  const sentence = benchmarkSentence(data, rank);
  if (data.overall.n === 0 || sentence === null) return null;

  const here = rank == null ? null : bandOfRank(rank);
  const rows: Row[] = [
    ...data.bands.map((band) => ({
      key: String(band.min),
      label: band.label,
      n: band.n,
      share: band.share,
      medianRelative: band.medianRelative,
      here: here?.min === band.min,
      total: false,
    })),
    {
      key: "all",
      label: "All ranks 2–1,000",
      n: data.overall.n,
      share: data.overall.share,
      medianRelative: data.overall.medianRelative,
      here: false,
      total: true,
    },
  ];

  return (
    <div>
      <p className="text-ink-body max-w-[34em] text-[15px]">{sentence}</p>

      <p className="label mt-6">
        Rank in the start week, then share that beat BTC
      </p>
      <ul className="m-0 mt-2 list-none p-0">
        {rows.map((row) => {
          const share = row.share ?? 0;
          return (
            <li
              key={row.key}
              aria-current={row.here ? "true" : undefined}
              className={
                row.here
                  ? "border-rule bg-paper-raised border-b px-2 py-3"
                  : row.total
                    ? "border-ink border-t px-2 py-3"
                    : "border-rule border-b px-2 py-3"
              }
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={row.here ? "text-ink font-medium" : "text-ink"}
                >
                  {row.label}
                  {row.here && (
                    <span className="text-accent-text ml-2 text-xs font-medium tracking-wide uppercase">
                      this coin
                    </span>
                  )}
                </span>
                <span className="num text-ink text-lg">
                  {row.share === null ? "n/a" : pct(row.share)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="bg-grid relative mt-2 h-2.5 w-full overflow-hidden rounded-[1px]"
              >
                <div
                  className="bg-accent h-full"
                  style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
                />
                {/* Halfway mark: past it, a coin would beat BTC more often than not. */}
                <div className="bg-ink absolute inset-y-0 left-1/2 w-px opacity-40" />
              </div>
              <p className="text-muted num mt-1.5 text-xs">
                {count(row.n)} coin-weeks
                {row.medianRelative !== null && (
                  <>
                    {" · "}median {signedPct(row.medianRelative)} vs BTC
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="text-muted mt-3 max-w-[40em] text-[13px]">
        Each count is coin-weeks: the same coin appears in many weeks that
        overlap in time, so these are not independent bets. A coin that left the
        top 5,000 within the 2 years counts as a total loss. The median compares
        the coin with BTC over the same 104 weeks.
      </p>
    </div>
  );
}
