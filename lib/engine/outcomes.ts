import type { Outcome, SeriesPoint } from "./types";

/** How far from the exact end week we look for a price before calling it gone. */
export const END_TOLERANCE_WEEKS = 2;
export const TOP_RANK = 20;

/**
 * Forward outcomes for every point of one lineage over `horizon` weeks.
 * A coin missing from the snapshots around the end week fell out of the top
 * 5000 or stopped trading: counted as a total loss, not as missing data.
 *
 * @param btcPrice   BTC price by week index (null where unknown)
 * @param lastWeek   index of the last snapshot
 */
export function computeOutcomes(
  points: readonly SeriesPoint[],
  btcPrice: readonly (number | null)[],
  lastWeek: number,
  horizon: number,
): Outcome[] {
  const byWeek = new Map(points.map((point) => [point.week, point]));

  /**
   * The coin's price at the end week, or the nearest week within the
   * tolerance. BTC is then read at that same week, so both returns cover the
   * same span.
   */
  function priceNear(week: number): { price: number; btc: number } | null {
    for (let offset = 0; offset <= END_TOLERANCE_WEEKS; offset++) {
      for (const candidate of offset === 0
        ? [week]
        : [week - offset, week + offset]) {
        if (candidate > lastWeek) continue;
        const point = byWeek.get(candidate);
        const btc = btcPrice[candidate];
        if (point && point.price > 0 && btc) return { price: point.price, btc };
      }
    }
    return null;
  }

  return points.map((point) => {
    const end = point.week + horizon;
    const btcStart = btcPrice[point.week];
    const btcEnd = btcPrice[end];
    if (end > lastWeek || !btcStart || !btcEnd) {
      return {
        complete: false,
        coinReturn: null,
        btcReturn: null,
        beatBtc: null,
        fellOut: null,
        reachedTop20: null,
      };
    }

    const endPoint = priceNear(end);
    const fellOut = endPoint === null;
    const coinReturn = fellOut ? -1 : endPoint.price / point.price - 1;
    const btcReturn = (endPoint?.btc ?? btcEnd) / btcStart - 1;

    let reachedTop20 = false;
    for (let week = point.week + 1; week <= end && !reachedTop20; week++) {
      const later = byWeek.get(week);
      reachedTop20 =
        !!later && !later.continuation && later.rankAdj <= TOP_RANK;
    }

    return {
      complete: true,
      coinReturn,
      btcReturn,
      beatBtc: coinReturn > btcReturn,
      fellOut,
      reachedTop20,
    };
  });
}
