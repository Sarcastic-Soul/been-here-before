import { pct, pctRange, signedPct } from "@/lib/format";
import type { CycleRow } from "@/lib/verdict/types";

import { RateBar } from "./rate-bar";

/** The same rates split by BTC halving era, so one era cannot hide inside the total. */
export function CycleTable({ rows }: { rows: CycleRow[] }) {
  if (rows.length === 0)
    return <p className="text-muted text-sm">No episodes to split.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px] border-collapse text-sm">
        <caption className="sr-only">
          Share of episodes that beat BTC over 2 years, by halving cycle
        </caption>
        <thead>
          <tr className="text-muted text-left text-xs">
            <th scope="col" className="border-ink border-b py-2 font-medium">
              Halving cycle
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
          {rows.map((row) => (
            <tr key={row.cycle}>
              <th
                scope="row"
                className="border-rule border-b py-2.5 text-left font-normal"
              >
                {row.label}
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
                      {pctRange(row.summary.beatBtc.lo, row.summary.beatBtc.hi)}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
