import { describe, expect, it } from "vitest";

import { cycleOf, marketPhases } from "@/lib/engine/cycles";
import { ageBucket, inBands, nearestTwins, selectEpisodes, type CandidateRow } from "@/lib/engine/match";
import { isExcludedAsset, looksPegged } from "@/lib/engine/universe";

const target = { rankAdj: 100, drawdown: 0.8, ageWeeks: 150 };

function row(lineageId: number, week: string, extra: Partial<CandidateRow> = {}): CandidateRow {
  return { lineageId, week, rankAdj: 100, drawdown: 0.8, ageWeeks: 150, ...extra };
}

describe("bands", () => {
  it("uses rank x1.5, drawdown +-10 points and the same age bucket", () => {
    expect(inBands(target, row(1, "2019-01-06", { rankAdj: 67 }))).toBe(true);
    expect(inBands(target, row(1, "2019-01-06", { rankAdj: 151 }))).toBe(false);
    expect(inBands(target, row(1, "2019-01-06", { drawdown: 0.69 }))).toBe(false);
    expect(inBands(target, row(1, "2019-01-06", { ageWeeks: 210 }))).toBe(false);
    expect(ageBucket(51)).toBe(0);
    expect(ageBucket(52)).toBe(1);
    expect(ageBucket(1000)).toBe(3);
  });
});

describe("selectEpisodes", () => {
  it("keeps one episode per coin per cycle, the first week, and skips the coin itself", () => {
    const rows = [
      row(1, "2018-03-04"),
      row(1, "2018-02-04"),
      row(1, "2022-06-05"),
      row(2, "2019-01-06"),
      row(3, "2019-01-06", { rankAdj: 400 }),
      row(9, "2019-01-06"),
    ];
    const picked = selectEpisodes(rows, target, 9);
    expect(picked.map((e) => [e.lineageId, e.week, e.cycle])).toEqual([
      [1, "2018-02-04", "2016-20"],
      [2, "2019-01-06", "2016-20"],
      [1, "2022-06-05", "2020-24"],
    ]);
  });
});

describe("nearestTwins", () => {
  it("returns the closest episodes, one per coin", () => {
    const rows = [
      row(1, "2018-02-04", { drawdown: 0.88 }),
      row(1, "2022-02-06", { drawdown: 0.8 }),
      row(2, "2019-01-06", { drawdown: 0.85 }),
      row(3, "2019-01-06", { rankAdj: 140 }),
    ];
    const twins = nearestTwins(rows, target, 2);
    expect(twins.map((t) => [t.lineageId, t.week])).toEqual([
      [1, "2022-02-06"],
      [2, "2019-01-06"],
    ]);
  });
});

describe("cycles and phases", () => {
  it("maps dates to halving eras", () => {
    expect(cycleOf("2014-01-05")).toBe("2012-16");
    expect(cycleOf("2018-01-07")).toBe("2016-20");
    expect(cycleOf("2022-01-02")).toBe("2020-24");
    expect(cycleOf("2026-11-15")).toBe("2024-28");
  });

  it("labels market phases from the running peak only", () => {
    const caps = [100, 90, 60, 40, ...Array(52).fill(45), 70];
    const phases = marketPhases(caps);
    expect(phases[0].phase).toBe("near_peak");
    expect(phases[2].phase).toBe("correction");
    expect(phases[3].phase).toBe("bear");
    expect(phases[caps.length - 1].phase).toBe("recovery");
  });
});

describe("universe", () => {
  const meta = (name: string, symbol: string, tags: string[] = [], id = 99999) => ({
    id,
    name,
    symbol,
    slug: name.toLowerCase(),
    tags,
  });

  it("removes stablecoins, wrappers and staked tokens", () => {
    expect(isExcludedAsset(meta("Tether", "USDT"))).toBe(true);
    expect(isExcludedAsset(meta("Wrapped Bitcoin", "WBTC"))).toBe(true);
    expect(isExcludedAsset(meta("Lido Staked ETH", "stETH"))).toBe(true);
    expect(isExcludedAsset(meta("Some Coin", "SOME", ["stablecoin"]))).toBe(true);
    expect(isExcludedAsset(meta("NuBits", "USNBT"))).toBe(true);
  });

  it("keeps ordinary coins", () => {
    expect(isExcludedAsset(meta("Bitcoin", "BTC"))).toBe(false);
    expect(isExcludedAsset(meta("Ethereum", "ETH"))).toBe(false);
    expect(isExcludedAsset(meta("Filecoin", "FIL"))).toBe(false);
    expect(isExcludedAsset(meta("Maker", "MKR", ["stablecoin-protocol"]))).toBe(false);
    expect(isExcludedAsset(meta("Rocket Pool", "RPL"))).toBe(false);
    expect(isExcludedAsset(meta("Lido DAO", "LDO", ["liquid-staking-derivatives"]))).toBe(false);
    expect(isExcludedAsset(meta("DigixDAO", "DGD", ["stablecoin"], 1229))).toBe(false);
    expect(isExcludedAsset(meta("StableCoin", "SBC", [], 40))).toBe(false);
  });
});

describe("looksPegged", () => {
  it("flags prices locked to a reference", () => {
    const btc = [100, 200, 150, 300, 250, 400, 120, 90, 60, 500];
    expect(looksPegged(btc.map((p) => p * 1.001), btc)).toBe(true);
    expect(looksPegged(Array(10).fill(1.01), Array(10).fill(1))).toBe(true);
  });

  it("does not flag coins that move on their own", () => {
    const btc = [100, 200, 150, 300, 250, 400, 120, 90, 60, 500];
    const alt = [1, 3, 2, 2, 5, 9, 1, 0.5, 0.4, 2];
    expect(looksPegged(alt, btc)).toBe(false);
    expect(looksPegged([1, 1.1], [1, 1])).toBe(false);
  });

  it("needs the reference for most of the coin's history", () => {
    const prices = [5, 9, 2, 7, 3, 100, 101];
    const reference = [0, 0, 0, 0, 0, 100, 100];
    expect(looksPegged(prices, reference)).toBe(false);
  });
});
