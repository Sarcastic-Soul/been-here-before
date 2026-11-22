import {
  drawdownPct,
  monthYear,
  relativeToBtc,
  signedPct,
  years,
} from "@/lib/format";
import type { EpisodeRow } from "@/lib/verdict/types";

import { ScrollX } from "./scroll-x";

function result(episode: EpisodeRow) {
  if (episode.fellOut104w) return "Fell out";
  return episode.beatBtc104w ? "Beat BTC" : "Lagged";
}

// The answer columns come first, so a phone shows them without scrolling.
const HEADS: { label: string; right?: boolean }[] = [
  { label: "Coin" },
  { label: "Result" },
  { label: "vs BTC", right: true },
  { label: "2y return", right: true },
  { label: "Entered the spot", right: true },
  { label: "Rank then", right: true },
  { label: "Down from peak", right: true },
  { label: "Listed for", right: true },
];

const CELL = "border-rule border-b py-2 pl-5";

/** Every past episode behind the verdict. Also the table view of the dot chart. */
export function EpisodeTable({ episodes }: { episodes: EpisodeRow[] }) {
  const sorted = [...episodes].sort((a, b) => a.week.localeCompare(b.week));
  return (
    <ScrollX label="All past episodes" className="max-h-[640px]">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">All past episodes, oldest first</caption>
        <thead>
          <tr className="text-muted text-left text-xs">
            {HEADS.map((head, i) => (
              <th
                key={head.label}
                scope="col"
                className={`border-ink bg-paper sticky top-0 border-b py-2 font-medium whitespace-nowrap ${head.right ? "text-right" : ""} ${i === 0 ? "left-0 z-[2] pr-3" : "z-[1] pl-5"}`}
              >
                {head.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((episode) => {
            const relative = relativeToBtc(episode.ret104w, episode.btcRet104w);
            return (
              <tr key={`${episode.lineageId}-${episode.week}`}>
                <th
                  scope="row"
                  className="border-rule bg-paper sticky left-0 z-[1] max-w-[11rem] border-b py-2 pr-3 text-left font-normal"
                >
                  <span className="block truncate">
                    {episode.name}{" "}
                    <span className="num text-muted text-xs">
                      {episode.symbol}
                    </span>
                  </span>
                </th>
                <td
                  className={`${CELL} whitespace-nowrap ${episode.beatBtc104w ? "text-accent-text font-medium" : "text-muted"}`}
                >
                  {result(episode)}
                </td>
                <td className={`num ${CELL} text-right`}>
                  {relative === null ? "n/a" : signedPct(relative)}
                </td>
                <td className={`num ${CELL} text-right`}>
                  {signedPct(episode.ret104w)}
                </td>
                <td className={`num ${CELL} text-right whitespace-nowrap`}>
                  {monthYear(episode.week)}
                </td>
                <td className={`num ${CELL} text-right`}>{episode.rankAdj}</td>
                <td className={`num ${CELL} text-right`}>
                  {drawdownPct(episode.drawdown)}
                </td>
                <td className={`num ${CELL} text-right whitespace-nowrap`}>
                  {years(episode.ageWeeks)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollX>
  );
}
