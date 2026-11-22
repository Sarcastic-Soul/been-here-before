import type { TwinSeries } from "@/components/twin-chart";

import type { Twin } from "./types";

/** Shape the API twins for the chart (plain data, safe to pass to a client component). */
export function toTwinSeries(twins: Twin[]): TwinSeries[] {
  return twins.map((twin) => ({
    key: `${twin.episode.lineageId}-${twin.episode.week}`,
    name: twin.episode.name,
    symbol: twin.episode.symbol,
    start: twin.episode.week,
    beat: twin.episode.beatBtc104w,
    path: twin.path,
  }));
}
