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
  it("is 1 when it cannot be measured", () => {
    expect(designEffect([{ k: 3, n: 10 }])).toBe(1);
    expect(
      designEffect([
        { k: 0, n: 10 },
        { k: 0, n: 10 },
      ]),
    ).toBe(1);
    expect(
      designEffect([
        { k: 5, n: 5 },
        { k: 5, n: 5 },
      ]),
    ).toBe(1);
    expect(designEffect([])).toBe(1);
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

  it("handles an empty list", () => {
    expect(rate([])).toMatchObject({ n: 0, lo: 0, hi: 1, nEff: 0 });
  });
});
