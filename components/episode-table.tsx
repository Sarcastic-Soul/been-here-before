import {
  drawdownPct,
  monthYear,
  relativeToBtc,
  signedPct,
  years,
} from "@/lib/format";
import type { EpisodeRow } from "@/lib/verdict/types";

function result(episode: EpisodeRow) {
  if (episode.fellOut104w) return "Fell out";
  return episode.beatBtc104w ? "Beat BTC" : "Lagged";
}

/** Every past episode behind the verdict. Also the table view of the dot chart. */
export function EpisodeTable({ episodes }: { episodes: EpisodeRow[] }) {
  const sorted = [...episodes].sort((a, b) => a.week.localeCompare(b.week));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-sm">
        <caption className="sr-only">All past episodes, oldest first</caption>
        <thead>
          <tr className="text-muted text-left text-xs">
            {[
              "Entered the spot",
              "Coin",
              "Rank then",
              "Down from peak",
              "Listed for",
              "2y return",
              "vs BTC",
              "Result",
            ].map((head, i) => (
              <th
                key={head}
                scope="col"
                className={`border-ink bg-paper sticky top-0 border-b py-2 font-medium ${i >= 2 && i <= 6 ? "text-right" : ""} ${i === 7 ? "pl-6" : ""}`}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((episode) => {
            const relative = relativeToBtc(episode.ret104w, episode.btcRet104w);
            return (
              <tr key={`${episode.lineageId}-${episode.week}`}>
                <td className="num border-rule border-b py-2">
                  {monthYear(episode.week)}
                </td>
                <th
                  scope="row"
                  className="border-rule border-b py-2 text-left font-normal"
                >
                  {episode.name}{" "}
                  <span className="num text-muted text-xs">
                    {episode.symbol}
                  </span>
                </th>
                <td className="num border-rule border-b py-2 text-right">
                  {episode.rankAdj}
                </td>
                <td className="num border-rule border-b py-2 text-right">
                  {drawdownPct(episode.drawdown)}
                </td>
                <td className="num border-rule border-b py-2 text-right">
                  {years(episode.ageWeeks)}
                </td>
                <td className="num border-rule border-b py-2 text-right">
                  {signedPct(episode.ret104w)}
                </td>
                <td className="num border-rule border-b py-2 text-right">
                  {relative === null ? "n/a" : signedPct(relative)}
                </td>
                <td
                  className={`border-rule border-b py-2 pl-6 ${episode.beatBtc104w ? "text-accent-text font-medium" : "text-muted"}`}
                >
                  {result(episode)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
