import type { Summary } from "@/lib/engine/verdict";
import { pct, pctRange, signedPct } from "@/lib/format";
import type { CycleRow, PhaseRow } from "@/lib/verdict/types";

import { RateBar } from "./rate-bar";

interface SplitRow {
  key: string;
  label: string;
  summary: Summary;
}

/** The same rates split one way (by era, by market phase), one row per group. */
function SplitTable({
  rows,
  heading,
  caption,
  current,
  currentNote = "today",
}: {
  rows: SplitRow[];
  heading: string;
  caption: string;
  /** Key of the row that matches today, marked in the table. */
  current?: string;
  currentNote?: string;
}) {
  if (rows.length === 0)
    return <p className="text-muted text-sm">No episodes to split.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-muted text-left text-xs">
            <th scope="col" className="border-ink border-b py-2 font-medium">
              {heading}
            </th>
            <th
              scope="col"
              className="border-ink border-b py-2 text-right font-medium"
            >
              Episodes
            </th>
            <th
              scope="col"
              className="border-ink border-b py-2 pl-4 font-medium sm:pl-6"
            >
              Beat BTC, 95% range
            </th>
            <th
              scope="col"
              className="border-ink border-b py-2 text-right font-medium"
            >
              Median 2y return
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isCurrent = row.key === current;
            return (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="border-rule border-b py-2.5 text-left font-normal"
                >
                  {row.label}
                  {isCurrent && (
                    <span className="text-accent-text ml-2 text-xs font-medium tracking-wide uppercase">
                      {currentNote}
                    </span>
                  )}
                </th>
                <td className="num border-rule border-b py-2.5 text-right">
                  {row.summary.n}
                </td>
                <td className="border-rule border-b py-2.5 pl-4 sm:pl-6">
                  <span className="flex items-center gap-3">
                    <span className="hidden sm:block">
                      <RateBar rate={row.summary.beatBtc} width={96} />
                    </span>
                    <span className="num">
                      {pct(row.summary.beatBtc.p)}{" "}
                      <span className="text-muted">
                        (
                        {pctRange(
                          row.summary.beatBtc.lo,
                          row.summary.beatBtc.hi,
                        )}
                        )
                      </span>
                    </span>
                  </span>
                </td>
                <td className="num border-rule border-b py-2.5 text-right">
                  {row.summary.medianCoinReturn === null
                    ? "n/a"
                    : signedPct(row.summary.medianCoinReturn)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The same rates split by BTC halving era, so one era cannot hide inside the total. */
export function CycleTable({ rows }: { rows: CycleRow[] }) {
  return (
    <SplitTable
      rows={rows.map((row) => ({ ...row, key: row.cycle }))}
      heading="Halving cycle"
      caption="Share of episodes that beat BTC over 2 years, by halving cycle"
    />
  );
}

/** The same rates split by the whole market's phase in each episode's start week. */
export function PhaseTable({
  rows,
  current,
  currentNote = "now",
}: {
  rows: PhaseRow[];
  current?: string;
  currentNote?: string;
}) {
  return (
    <SplitTable
      rows={rows.map((row) => ({ ...row, key: row.phase }))}
      heading="Market when it started"
      caption="Share of episodes that beat BTC over 2 years, by market phase in the start week"
      current={current}
      currentNote={currentNote}
    />
  );
}
