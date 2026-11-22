import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: vi.fn() }));

import {
  bandOfRank,
  benchmarkSentence,
  shapeBenchmark,
  type BenchmarkRow,
} from "@/lib/verdict/get-benchmark";

const rows: BenchmarkRow[] = [
  { bandMin: 51, n: 200, beat: 30, fellOut: 40, medianRelative: -0.8 },
  { bandMin: 2, n: 100, beat: 25, fellOut: 1, medianRelative: -0.5 },
  { bandMin: 201, n: 700, beat: 70, fellOut: 300, medianRelative: -0.9 },
  { bandMin: null, n: 1000, beat: 125, fellOut: 341, medianRelative: -0.85 },
];

describe("bandOfRank", () => {
  it("puts ranks in the right band, edges included", () => {
    expect(bandOfRank(2)?.min).toBe(2);
    expect(bandOfRank(10)?.min).toBe(2);
    expect(bandOfRank(11)?.min).toBe(11);
    expect(bandOfRank(50)?.min).toBe(11);
    expect(bandOfRank(51)?.min).toBe(51);
    expect(bandOfRank(200)?.min).toBe(51);
    expect(bandOfRank(201)?.min).toBe(201);
    expect(bandOfRank(1000)?.min).toBe(201);
  });

  it("has no band for BTC (rank 1) or ranks past 1,000", () => {
    expect(bandOfRank(1)).toBeNull();
    expect(bandOfRank(1001)).toBeNull();
  });
});

describe("shapeBenchmark", () => {
  const result = shapeBenchmark(rows);

  it("returns the four bands in rank order whatever the row order", () => {
    expect(result.bands.map((b) => b.label)).toEqual([
      "2–10",
      "11–50",
      "51–200",
      "201–1,000",
    ]);
  });

  it("computes the share of coin-weeks that beat BTC", () => {
    expect(result.bands[0].share).toBeCloseTo(0.25);
    expect(result.bands[2].share).toBeCloseTo(0.15);
    expect(result.bands[3].share).toBeCloseTo(0.1);
    expect(result.overall.share).toBeCloseTo(0.125);
    expect(result.overall.medianRelative).toBe(-0.85);
  });

  it("fills a band with no rows with zeros and a null share", () => {
    expect(result.bands[1]).toMatchObject({
      n: 0,
      beat: 0,
      fellOut: 0,
      share: null,
      medianRelative: null,
    });
  });

  it("adds up the bands when the total row is missing", () => {
    const sum = shapeBenchmark(rows.filter((r) => r.bandMin !== null));
    expect(sum.overall.n).toBe(1000);
    expect(sum.overall.beat).toBe(125);
    expect(sum.overall.fellOut).toBe(341);
    expect(sum.overall.medianRelative).toBeNull();
  });

  it("handles no rows at all", () => {
    const empty = shapeBenchmark([]);
    expect(empty.overall).toMatchObject({ n: 0, share: null });
    expect(benchmarkSentence(empty)).toBeNull();
  });
});

describe("benchmarkSentence", () => {
  const data = shapeBenchmark(rows);

  it("speaks about the band that holds the rank", () => {
    expect(benchmarkSentence(data, 7)).toBe(
      "Since 2013, a coin ranked 2 to 10 in a given week beat holding BTC over the next 2 years only 25% of the time.",
    );
    expect(benchmarkSentence(data, 120)).toContain("ranked 51 to 200");
  });

  it("falls back to all ranks for no rank, BTC, or a rank past 1,000", () => {
    for (const rank of [undefined, null, 1, 1500]) {
      expect(benchmarkSentence(data, rank)).toContain("ranked 2 to 1,000");
    }
  });

  it("drops 'only' when most coin-weeks beat BTC", () => {
    const high = shapeBenchmark([
      { bandMin: 2, n: 10, beat: 7, fellOut: 0, medianRelative: 0.1 },
    ]);
    expect(benchmarkSentence(high, 5)).toContain("2 years 70% of the time");
  });
});
