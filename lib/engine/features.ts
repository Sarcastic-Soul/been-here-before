import type { Features, SeriesPoint } from "./types";

const WEEK_MS = 7 * 86_400_000;

function weeksBetween(fromDay: string, toDay: string): number {
  return Math.floor((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / WEEK_MS);
}

/**
 * Features for every point of one lineage, sorted by week. Uses a forward pass,
 * so a point's features only see points at or before its week (no look-ahead).
 * Continuation points get null: they are someone else's coin.
 *
 * @param weekDates  YYYY-MM-DD for each week index
 * @param dateAdded  CMC date_added (YYYY-MM-DD) for the lineage root, if known
 */
export function computeFeatures(
  points: readonly SeriesPoint[],
  weekDates: readonly string[],
  dateAdded: string | null,
): (Features | null)[] {
  let peak = 0;
  let peakWeek = -1;
  let firstDay: string | null = null;

  return points.map((point) => {
    if (point.continuation) return null;
    const day = weekDates[point.week];
    if (firstDay === null) {
      // Listing date, or first sighting if CMC's date is missing or later.
      firstDay = dateAdded && dateAdded < day ? dateAdded : day;
    }
    if (point.price > peak) {
      peak = point.price;
      peakWeek = point.week;
    }
    return {
      runningPeak: peak,
      drawdown: peak > 0 ? 1 - point.price / peak : 0,
      weeksSincePeak: point.week - peakWeek,
      ageWeeks: Math.max(0, weeksBetween(firstDay, day)),
    };
  });
}
