import { describe, expect, it } from "vitest";

import { dailyStates, type Anchor, type KnownCoin, type ListingRow } from "@/lib/cron/daily-state";

const asOf = new Date("2026-11-22T00:00:00Z");
const WEEK = 7 * 86_400_000;

function listing(id: number, cmcRank: number, price: number, extra: Partial<ListingRow> = {}): ListingRow {
  return {
    id,
    name: `Coin ${id}`,
    symbol: `C${id}`,
    slug: `coin-${id}`,
    cmcRank,
    price,
    marketCap: price * 1e6,
    volume24h: 1e5,
    dateAdded: "2020-01-05T00:00:00.000Z",
    tags: [],
    isToken: false,
    ...extra,
  };
}

describe("dailyStates", () => {
  it("skips excluded coins when counting the adjusted rank", () => {
    const rows = [
      listing(1, 1, 60000),
      listing(825, 2, 1, { name: "Tether USDt", symbol: "USDT" }),
      listing(3, 3, 10),
    ];
    const known = new Map<number, KnownCoin>([[825, { lineageId: 825, priceFactor: 1, excludedReason: "rule" }]]);
    const { states, excluded } = dailyStates(rows, known, new Map(), asOf);
    expect(excluded).toBe(1);
    expect(states.map((s) => [s.coinId, s.rankAdj])).toEqual([
      [1, 1],
      [3, 2],
    ]);
  });

  it("keeps the old peak and counts weeks from it", () => {
    const anchor: Anchor = {
      runningPeak: 100,
      peakAt: new Date(asOf.getTime() - 10 * WEEK),
      bornAt: new Date(asOf.getTime() - 300 * WEEK),
    };
    const { states } = dailyStates([listing(5, 10, 20)], new Map(), new Map([[5, anchor]]), asOf);
    expect(states[0].runningPeakUsd).toBe(100);
    expect(states[0].drawdown).toBeCloseTo(0.8);
    expect(states[0].weeksSincePeak).toBe(10);
    expect(states[0].ageWeeks).toBe(300);
  });

  it("sets a new peak today when the price is above the old one", () => {
    const anchor: Anchor = { runningPeak: 10, peakAt: new Date("2021-01-03"), bornAt: new Date("2019-01-06") };
    const { states } = dailyStates([listing(5, 10, 12)], new Map(), new Map([[5, anchor]]), asOf);
    expect(states[0].drawdown).toBe(0);
    expect(states[0].weeksSincePeak).toBe(0);
  });

  it("uses lineage-root units for migrated coins", () => {
    // VET: 1 VEN = 100 VET, so a VET price of 0.02 is 2 in VEN units.
    const known = new Map<number, KnownCoin>([[3077, { lineageId: 1904, priceFactor: 100, excludedReason: null }]]);
    const anchor: Anchor = { runningPeak: 8, peakAt: new Date("2021-04-18"), bornAt: new Date("2017-08-27") };
    const { states } = dailyStates([listing(3077, 40, 0.02)], known, new Map([[1904, anchor]]), asOf);
    expect(states[0].lineageId).toBe(1904);
    expect(states[0].priceUsd).toBe(0.02);
    expect(states[0].drawdown).toBeCloseTo(0.75);
  });

  it("adds unknown coins to the coin list and starts their history today", () => {
    const { states, newCoins } = dailyStates([listing(40000, 300, 1.5)], new Map(), new Map(), asOf);
    expect(newCoins.map((c) => c.id)).toEqual([40000]);
    expect(states[0].drawdown).toBe(0);
    expect(states[0].ageWeeks).toBeGreaterThan(300);
  });
});
