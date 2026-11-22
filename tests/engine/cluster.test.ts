import { describe, expect, it } from "vitest";

import {
  clusteredRate,
  designEffect,
  halfYear,
  wilson,
} from "@/lib/engine/stats";

interface Item {
  week: string;
  hit: boolean;
}

function items(spec: [string, number, number][]): Item[] {
  // [week, episodes, hits]
  return spec.flatMap(([week, n, k]) =>
    Array.from({ length: n }, (_, i) => ({ week, hit: i < k })),
  );
}

const rate = (list: Item[]) =>
  clusteredRate(
    list,
    (item) => item.hit,
    (item) => halfYear(item.week),
  );

describe("halfYear", () => {
  it("splits the year at the end of June", () => {
    expect(halfYear("2022-01-02")).toBe("2022H1");
    expect(halfYear("2022-06-26")).toBe("2022H1");
    expect(halfYear("2022-07-03")).toBe("2022H2");
    expect(halfYear("2022-12-25")).toBe("2022H2");
  });
});

describe("designEffect", () => {
  it("assumes full bunching inside a half-year when it cannot be measured", () => {
    // One cluster: all episodes move together, so n = 10 counts as 1.
    expect(designEffect([{ k: 3, n: 10 }])).toBe(10);
    // Every outcome the same: design effect is sum(n_c^2) / n.
    expect(
      designEffect([
        { k: 0, n: 10 },
        { k: 0, n: 10 },
      ]),
    ).toBe(10);
    expect(
      designEffect([
        { k: 5, n: 5 },
        { k: 5, n: 5 },
      ]),
    ).toBe(5);
    // Uneven clusters of 3, 2, 2, 1, 1, 1 (n = 10): sum(n_c^2) / n = 20 / 10.
    expect(
      designEffect([
        { k: 0, n: 3 },
        { k: 0, n: 2 },
        { k: 0, n: 2 },
        { k: 0, n: 1 },
        { k: 0, n: 1 },
        { k: 0, n: 1 },
      ]),
    ).toBeCloseTo((9 + 4 + 4 + 1 + 1 + 1) / 10, 10);
  });

  it("is 1 for no episodes and never below 1", () => {
    expect(designEffect([])).toBe(1);
    // Every cluster holds one episode: nothing bunches.
    expect(
      designEffect([
        { k: 0, n: 1 },
        { k: 0, n: 1 },
        { k: 0, n: 1 },
      ]),
    ).toBe(1);
  });

  it("is never below 1 when clusters look alike", () => {
    expect(
      designEffect([
        { k: 2, n: 10 },
        { k: 2, n: 10 },
        { k: 2, n: 10 },
      ]),
    ).toBe(1);
  });

  it("grows when outcomes bunch inside clusters", () => {
    // Every hit sits in one cluster: outcomes depend on when, not which coin.
    const bunched = designEffect([
      { k: 10, n: 10 },
      { k: 0, n: 10 },
      { k: 0, n: 10 },
      { k: 0, n: 10 },
    ]);
    expect(bunched).toBeGreaterThan(5);
  });
});

describe("clusteredRate", () => {
  it("keeps raw k, n and p and equals Wilson when nothing bunches", () => {
    const list = items([
      ["2018-01-07", 10, 2],
      ["2018-08-05", 10, 2],
      ["2019-02-03", 10, 2],
    ]);
    const r = rate(list);
    const plain = wilson(6, 30);
    expect(r).toMatchObject({ k: 6, n: 30, p: 0.2, nEff: 30 });
    expect(r.lo).toBeCloseTo(plain.lo, 10);
    expect(r.hi).toBeCloseTo(plain.hi, 10);
  });

  it("widens the range when hits bunch in one half-year", () => {
    const list = items([
      ["2018-01-07", 10, 8],
      ["2018-08-05", 10, 0],
      ["2019-02-03", 10, 0],
      ["2019-08-04", 10, 0],
    ]);
    const r = rate(list);
    const plain = wilson(8, 40);
    expect(r.k).toBe(8);
    expect(r.n).toBe(40);
    expect(r.nEff).toBeLessThan(10);
    expect(r.lo).toBeLessThan(plain.lo);
    expect(r.hi).toBeGreaterThan(plain.hi);
  });

  it("treats 0 of n as bunched when the design effect cannot be measured", () => {
    // 20 episodes, none beat BTC, 5 half-years of 4 each. The plain range
    // would be 0-16%; the worst case counts 5 independent looks.
    const list = items([
      ["2018-01-07", 4, 0],
      ["2018-08-05", 4, 0],
      ["2019-01-06", 4, 0],
      ["2019-08-04", 4, 0],
      ["2020-01-05", 4, 0],
    ]);
    const r = rate(list);
    const worst = wilson(0, 5);
    expect(r).toMatchObject({ k: 0, n: 20, p: 0 });
    expect(r.nEff).toBeCloseTo(5, 10);
    expect(r.lo).toBe(0);
    expect(r.hi).toBeCloseTo(worst.hi, 10);
    expect(r.hi).toBeGreaterThan(0.4);
    expect(r.hi).toBeGreaterThan(wilson(0, 20).hi * 2);
  });

  it("gives effective n 1 when every episode starts in one half-year", () => {
    const zero = rate(items([["2018-01-07", 20, 0]]));
    expect(zero.nEff).toBeCloseTo(1, 10);
    expect(zero.hi).toBeCloseTo(wilson(0, 1).hi, 10);
    // Mixed outcomes in a single cluster are also unmeasurable.
    const mixed = rate(items([["2018-01-07", 20, 6]]));
    expect(mixed.nEff).toBeCloseTo(1, 10);
    expect(mixed.p).toBeCloseTo(0.3, 10);
  });

  it("uses Kish's effective number of clusters for uneven half-years", () => {
    // 16 + 4 episodes, none hit: n^2 / sum(n_c^2) = 400 / 272.
    const r = rate(
      items([
        ["2018-01-07", 16, 0],
        ["2019-01-06", 4, 0],
      ]),
    );
    expect(r.nEff).toBeCloseTo(400 / 272, 10);
  });

  it("leaves the measurable case unchanged", () => {
    // Same data as the "widens the range" case: formula is the old robust one.
    const list = items([
      ["2018-01-07", 10, 8],
      ["2018-08-05", 10, 0],
      ["2019-02-03", 10, 0],
      ["2019-08-04", 10, 0],
    ]);
    const p = 8 / 40;
    const squares = (8 - p * 10) ** 2 + 3 * (0 - p * 10) ** 2;
    const robust = ((4 / 3) * squares) / 1600;
    const expected = 40 / Math.max(1, robust / ((p * (1 - p)) / 40));
    expect(rate(list).nEff).toBeCloseTo(expected, 10);
  });

  it("handles an empty list", () => {
    expect(rate([])).toMatchObject({ n: 0, lo: 0, hi: 1, nEff: 0 });
  });
});
