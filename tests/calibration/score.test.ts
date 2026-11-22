import { describe, expect, it } from "vitest";

import {
  brierGain,
  byYear,
  gainInterval,
  mulberry32,
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
