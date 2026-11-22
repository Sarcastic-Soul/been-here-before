import { describe, expect, it } from "vitest";

import { median, wilson } from "@/lib/engine/stats";
import { decide, summarize, type EpisodeOutcome } from "@/lib/engine/verdict";

/** One start week in each of five different half-years. */
const SPREAD_WEEKS = [
  "2018-01-07",
  "2018-08-05",
  "2019-01-06",
  "2019-08-04",
  "2020-01-05",
];

/**
 * Episodes spread evenly over five half-years, so the plain-rate cases are not
 * mistaken for a single bunched market. Wins are the first `wins` episodes,
 * which also spreads them evenly.
 */
function episodes(n: number, wins: number): EpisodeOutcome[] {
  return Array.from({ length: n }, (_, i) => ({
    lineageId: i,
    week: SPREAD_WEEKS[i % SPREAD_WEEKS.length],
    cycle: "2016-20",
    beatBtc: i < wins,
    fellOut: false,
    reachedTop20: false,
    coinReturn: i < wins ? 1 : -0.5,
    btcReturn: 0.2,
  }));
}

describe("wilson", () => {
  it("matches known values", () => {
    const half = wilson(5, 10);
    expect(half.lo).toBeCloseTo(0.2366, 3);
    expect(half.hi).toBeCloseTo(0.7634, 3);
    expect(wilson(0, 20).lo).toBe(0);
    expect(wilson(0, 20).hi).toBeCloseTo(0.1611, 3);
    expect(wilson(20, 20).lo).toBeCloseTo(0.8389, 3);
  });

  it("returns the widest interval for n = 0", () => {
    expect(wilson(0, 0)).toMatchObject({ lo: 0, hi: 1 });
  });
});

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("decide", () => {
  it("refuses a verdict below 20 episodes", () => {
    expect(decide(summarize(episodes(19, 0)))).toBe("not_enough_history");
  });

  it("favors rotating when even the upper bound is under 35%", () => {
    expect(decide(summarize(episodes(100, 20)))).toBe("rotate");
  });

  it("favors holding when the lower bound is over 50%", () => {
    expect(decide(summarize(episodes(100, 70)))).toBe("hold");
  });

  it("says no clear edge in between", () => {
    expect(decide(summarize(episodes(40, 16)))).toBe("no_clear_edge");
  });

  it("widens the range when episodes bunch in time", () => {
    // 100 episodes, 20 wins. Spread evenly over 5 half-years the verdict is
    // rotate; with every win in one half-year the range widens past 35%.
    const halves = [
      "2018-01-07",
      "2018-08-05",
      "2019-01-06",
      "2019-08-04",
      "2020-01-05",
    ];
    // Five half-years of 20 episodes each.
    const even = episodes(100, 0).map((e, i) => ({
      ...e,
      week: halves[Math.floor(i / 20)],
      beatBtc: i % 5 === 0,
    }));
    const bunched = episodes(100, 20).map((e, i) => ({
      ...e,
      week: halves[Math.floor(i / 20)],
    }));
    const a = summarize(even);
    const b = summarize(bunched);
    expect(a.beatBtc.k).toBe(20);
    expect(b.beatBtc.k).toBe(20);
    expect(decide(a)).toBe("rotate");
    expect(b.beatBtc.nEff).toBeLessThan(20);
    expect(decide(b)).toBe("no_clear_edge");
    expect(b.clusters).toBe(5);
  });
});
