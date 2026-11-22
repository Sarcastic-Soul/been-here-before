import { describe, expect, it } from "vitest";

import {
  clearestFeature,
  compareWinners,
  higherShare,
  type WinnerInput,
} from "@/lib/engine/winners";

// Synthetic episodes only.
function row(beat: boolean, over: Partial<WinnerInput> = {}): WinnerInput {
  return {
    beatBtc104w: beat,
    drawdown: 0.8,
    weeksSincePeak: 40,
    turnover: 0.05,
    ageWeeks: 150,
    rankAdj: 120,
    ...over,
  };
}

describe("higherShare", () => {
  it("is 1 when every a is above every b, 0 when below, 0.5 for ties", () => {
    expect(higherShare([5, 6], [1, 2, 3])).toBe(1);
    expect(higherShare([1], [5, 6])).toBe(0);
    expect(higherShare([2, 2], [2, 2, 2])).toBe(0.5);
  });

  it("matches the brute-force pair count", () => {
    const a = [3, 1, 4, 1, 5, 9, 2, 6];
    const b = [2, 7, 1, 8, 2, 8, 1, 8, 2];
    let wins = 0;
    for (const x of a) for (const y of b) wins += x > y ? 1 : x === y ? 0.5 : 0;
    expect(higherShare(a, b)).toBeCloseTo(wins / (a.length * b.length), 12);
  });

  it("is null when a side is empty", () => {
    expect(higherShare([], [1])).toBeNull();
    expect(higherShare([1], [])).toBeNull();
  });
});

describe("compareWinners", () => {
  it("splits on beatBtc104w and takes medians per side", () => {
    const rows = [
      row(true, { drawdown: 0.5 }),
      row(true, { drawdown: 0.6 }),
      row(true, { drawdown: 0.7 }),
      row(false, { drawdown: 0.9 }),
      row(false, { drawdown: 0.95 }),
    ];
    const split = compareWinners(rows);
    expect(split.winners).toBe(3);
    expect(split.rest).toBe(2);
    const drop = split.features.find((f) => f.key === "drawdown")!;
    expect(drop.winners).toBe(0.6);
    expect(drop.rest).toBeCloseTo(0.925);
    expect(drop.higherShare).toBe(0);
    const age = split.features.find((f) => f.key === "ageWeeks")!;
    expect(age.higherShare).toBe(0.5);
  });

  it("leaves out missing and non-finite values per feature", () => {
    const split = compareWinners([
      row(true, { turnover: null }),
      row(true, { turnover: 0.2 }),
      row(false, { turnover: Number.POSITIVE_INFINITY }),
      row(false, { turnover: undefined }),
    ]);
    const turnover = split.features.find((f) => f.key === "turnover")!;
    expect(turnover.winners).toBe(0.2);
    expect(turnover.rest).toBeNull();
    expect(turnover.higherShare).toBeNull();
  });

  it("names the clearest feature only when the gap is big enough", () => {
    const even = compareWinners([row(true), row(false)]);
    expect(clearestFeature(even)).toBeNull();
    const split = compareWinners([
      row(true, { weeksSincePeak: 10, rankAdj: 100 }),
      row(true, { weeksSincePeak: 12, rankAdj: 140 }),
      row(false, { weeksSincePeak: 80, rankAdj: 120 }),
      row(false, { weeksSincePeak: 90, rankAdj: 130 }),
    ]);
    const clearest = clearestFeature(split);
    expect(clearest?.key).toBe("weeksSincePeak");
    expect(clearest?.less).toMatch(/closer in time/);
  });
});
