import { describe, expect, it } from "vitest";

import {
  brierGain,
  byYear,
  gainInterval,
  mulberry32,
  RANK_BANDS,
  bandIndex,
  emptyBandSums,
  toBandScore,
  type DateScore,
} from "@/lib/calibration/score";

const score = (testDate: string, brier: number, base: number): DateScore => ({
  testDate,
  n: 10,
  brier,
  base,
});

describe("brierGain", () => {
  it("is 1 - tool / baseline over the summed errors", () => {
    expect(
      brierGain([score("2018-01-07", 1, 2), score("2018-04-01", 1, 2)]),
    ).toBe(0.5);
    expect(brierGain([])).toBe(0);
  });
});

describe("byYear", () => {
  it("groups test dates by calendar year with mean scores", () => {
    const rows = byYear([
      score("2019-01-06", 2, 4),
      score("2018-01-07", 1, 1),
      score("2019-04-07", 2, 4),
    ]);
    expect(rows.map((r) => r.year)).toEqual([2018, 2019]);
    expect(rows[1]).toMatchObject({
      n: 20,
      brier: 0.2,
      brierBaseline: 0.4,
      gain: 0.5,
    });
    expect(rows[0].gain).toBe(0);
  });
});

describe("gainInterval", () => {
  it("is the same on every run", () => {
    const scores = Array.from({ length: 28 }, (_, i) =>
      score(`20${18 + Math.floor(i / 4)}-01-01`, 1 + (i % 3), 2),
    );
    expect(gainInterval(scores)).toEqual(gainInterval(scores));
  });

  it("is a single point when every date has the same gain", () => {
    const scores = Array.from({ length: 12 }, (_, i) =>
      score(`2020-0${(i % 9) + 1}-01`, 1, 2),
    );
    const { lo, hi } = gainInterval(scores, { draws: 200 });
    expect(lo).toBeCloseTo(0.5, 10);
    expect(hi).toBeCloseTo(0.5, 10);
  });

  it("brackets the point estimate and crosses zero when dates disagree", () => {
    const scores = Array.from({ length: 28 }, (_, i) =>
      score(
        `2018-01-${String((i % 28) + 1).padStart(2, "0")}`,
        i < 14 ? 1 : 3,
        2,
      ),
    );
    const { lo, hi } = gainInterval(scores, { draws: 2000 });
    expect(lo).toBeLessThanOrEqual(brierGain(scores));
    expect(hi).toBeGreaterThanOrEqual(brierGain(scores));
    expect(lo).toBeLessThan(0);
    expect(hi).toBeGreaterThan(0);
  });
});

describe("mulberry32", () => {
  it("gives numbers in [0, 1) and repeats for one seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      expect(b()).toBe(x);
    }
  });
});

describe("rank bands", () => {
  it("cover adjusted ranks 2 to 1000 with no gap", () => {
    expect(bandIndex(1)).toBe(-1);
    expect(bandIndex(2)).toBe(0);
    expect(bandIndex(19)).toBe(0);
    expect(bandIndex(20)).toBe(1);
    expect(bandIndex(500)).toBe(1);
    expect(bandIndex(501)).toBe(2);
    expect(bandIndex(1000)).toBe(2);
    expect(bandIndex(1001)).toBe(-1);
    expect(RANK_BANDS[0].min).toBe(2);
    expect(RANK_BANDS[RANK_BANDS.length - 1].max).toBe(1000);
  });

  it("turns running sums into a band score", () => {
    const sums = emptyBandSums(["rotate", "hold"]);
    sums.tested = 12;
    sums.predicted = 10;
    sums.brier = 1;
    sums.base = 2;
    sums.verdicts.rotate = { n: 10, beat: 1 };
    expect(toBandScore(RANK_BANDS[1], sums)).toEqual({
      band: "20-500",
      min: 20,
      max: 500,
      tested: 12,
      predicted: 10,
      brier: 0.1,
      brierBaseline: 0.2,
      gain: 0.5,
      verdicts: { rotate: { n: 10, beat: 1 }, hold: { n: 0, beat: 0 } },
    });
  });

  it("does not divide by zero for an empty band", () => {
    const empty = toBandScore(RANK_BANDS[0], emptyBandSums(["rotate"]));
    expect(empty).toMatchObject({ predicted: 0, brier: 0, gain: 0 });
  });
});
