import { describe, expect, it } from "vitest";

import { computeOutcomes } from "@/lib/engine/outcomes";

import { point } from "./helpers";

const btc = Array.from({ length: 20 }, (_, week) => 100 + week * 10); // BTC doubles by week 10

describe("computeOutcomes", () => {
  it("compares the coin's return with BTC over the horizon", () => {
    const points = [point(0, 1), point(5, 2), point(10, 3)];
    const [first] = computeOutcomes(points, btc, 19, 10);
    expect(first.complete).toBe(true);
    expect(first.coinReturn).toBeCloseTo(2);
    expect(first.btcReturn).toBeCloseTo(1);
    expect(first.beatBtc).toBe(true);
    expect(first.fellOut).toBe(false);
  });

  it("counts a coin missing at the end as fell out, with a total loss", () => {
    const points = [point(0, 1), point(3, 5)];
    const [first] = computeOutcomes(points, btc, 19, 10);
    expect(first.fellOut).toBe(true);
    expect(first.coinReturn).toBe(-1);
    expect(first.beatBtc).toBe(false);
  });

  it("allows a small gap around the end week", () => {
    const points = [point(0, 1), point(11, 1.5)];
    expect(computeOutcomes(points, btc, 19, 10)[0].fellOut).toBe(false);
  });

  it("reads BTC at the same week as the coin when the end week is a gap", () => {
    // Coin price found at week 12, not 10: BTC must be read at week 12 too.
    const points = [point(0, 1), point(12, 2.15)];
    const [first] = computeOutcomes(points, btc, 19, 10);
    expect(first.btcReturn).toBeCloseTo(220 / 100 - 1);
    // 2.15x beats BTC's 2.0x at week 10 but not its 2.2x at week 12.
    expect(first.beatBtc).toBe(false);
  });

  it("does not count a coin that fell out and came back by the end as fell out", () => {
    const points = [point(0, 1), point(9, 2), point(10, 2)];
    expect(computeOutcomes(points, btc, 19, 10)[0].fellOut).toBe(false);
  });

  it("marks windows past the last snapshot as incomplete", () => {
    const points = [point(12, 1)];
    expect(computeOutcomes(points, btc, 19, 10)[0]).toMatchObject({
      complete: false,
      beatBtc: null,
    });
  });

  it("flags reaching the top 20, but not through a merge successor's rank", () => {
    const viaOwn = [point(0, 1), point(4, 2, { rankAdj: 15 }), point(10, 1)];
    expect(computeOutcomes(viaOwn, btc, 19, 10)[0].reachedTop20).toBe(true);
    const viaMerge = [
      point(0, 1),
      point(4, 2, { rankAdj: 15, continuation: true }),
      point(10, 1),
    ];
    expect(computeOutcomes(viaMerge, btc, 19, 10)[0].reachedTop20).toBe(false);
  });
});
