import { describe, expect, it } from "vitest";

import {
  addWeeks,
  analyze,
  episodeCount,
  queryBands,
  snapToSunday,
  twinPath,
  type OutcomeRow,
} from "@/lib/verdict/analyze";

const target = { rankAdj: 100, drawdown: 0.8, ageWeeks: 300 };

function row(
  lineageId: number,
  week: string,
  extra: Partial<OutcomeRow> = {},
): OutcomeRow {
  return {
    lineageId,
    coinId: lineageId,
    week,
    rankAdj: 100,
    drawdown: 0.8,
    ageWeeks: 300,
    ret104w: -0.5,
    beatBtc104w: false,
    beatBtc52w: false,
    fellOut104w: false,
    reachedTop20: false,
    ...extra,
  };
}

const btc = new Map<string, number>();
for (let w = 0; w < 800; w++) btc.set(addWeeks("2013-04-28", w), 100 + w);

describe("analyze", () => {
  it("refuses below 20 episodes and still returns twins", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(i + 1, "2018-01-07"));
    const result = analyze(target, 999, rows, btc, new Map());
    expect(result.summary.n).toBe(10);
    expect(result.verdict).toBe("not_enough_history");
    expect(result.twinEpisodes).toHaveLength(5);
  });

  it("says rotate when almost nobody beat BTC", () => {
    const rows = Array.from({ length: 40 }, (_, i) =>
      row(i + 1, "2018-01-07", { beatBtc104w: i === 0 }),
    );
    const result = analyze(target, 999, rows, btc, new Map());
    expect(result.summary.n).toBe(40);
    expect(result.summary.beatBtc.hi).toBeLessThan(0.35);
    expect(result.verdict).toBe("rotate");
  });

  it("says hold when most beat BTC, and splits by cycle", () => {
    const rows = [
      ...Array.from({ length: 30 }, (_, i) =>
        row(i + 1, "2018-01-07", { beatBtc104w: i < 27 }),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        row(i + 1, "2021-06-06", { beatBtc104w: i < 25 }),
      ),
    ];
    const result = analyze(target, 999, rows, btc, new Map());
    expect(result.summary.n).toBe(60);
    expect(result.summary.distinctCoins).toBe(30);
    expect(result.verdict).toBe("hold");
    expect(result.byCycle.map((c) => [c.cycle, c.summary.n])).toEqual([
      ["2016-20", 30],
      ["2020-24", 30],
    ]);
  });

  it("reports the rate a survivors-only study would give", () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      row(i + 1, "2018-01-07", { beatBtc104w: i < 6 }),
    );
    // The 6 winners and 4 of the losers are still listed today.
    const alive = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const result = analyze(target, 999, rows, btc, new Map(), { alive });
    expect(result.summary.beatBtc).toMatchObject({ k: 6, n: 30 });
    expect(result.survivorsOnly).toMatchObject({ k: 6, n: 10, p: 0.6 });
    expect(result.episodes.filter((e) => e.aliveToday)).toHaveLength(10);
  });

  it("tags each episode with its market phase and splits by phase", () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, i) =>
        row(i + 1, "2018-01-07", { beatBtc104w: i < 5 }),
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        row(i + 101, "2019-01-06", { beatBtc104w: i < 9 }),
      ),
      row(50, "2020-01-05"),
    ];
    const phases = new Map([
      ["2018-01-07", "near_peak" as const],
      ["2019-01-06", "bear" as const],
    ]);
    const result = analyze(target, 999, rows, btc, new Map(), { phases });
    expect(result.episodes.find((e) => e.week === "2019-01-06")?.phase).toBe(
      "bear",
    );
    // A week with no known phase is left out of the split, not guessed.
    expect(result.episodes.find((e) => e.week === "2020-01-05")?.phase).toBe(
      undefined,
    );
    expect(
      result.byPhase?.map((p) => [p.phase, p.summary.n, p.summary.beatBtc.k]),
    ).toEqual([
      ["near_peak", 25, 5],
      ["bear", 15, 9],
    ]);
  });

  it("leaves out the coin's own lineage and rows outside the bands", () => {
    const rows = [
      row(7, "2018-01-07"),
      row(8, "2018-01-07", { drawdown: 0.5 }),
      row(9, "2018-01-07"),
    ];
    const result = analyze(target, 7, rows, btc, new Map());
    expect(result.episodes.map((e) => e.lineageId)).toEqual([9]);
  });

  it("uses a wider step's bands when told to, and labels the step", () => {
    const rows = [
      row(1, "2018-01-07"),
      row(2, "2018-01-07", { rankAdj: 180, drawdown: 0.66 }),
    ];
    expect(episodeCount(rows, target, 999, 0)).toBe(1);
    expect(episodeCount(rows, target, 999, 1)).toBe(2);
    const result = analyze(target, 999, rows, btc, new Map(), {
      stepIndex: 1,
      tried: [1, 2],
    });
    expect(result.summary.n).toBe(2);
    expect(result.bands).toMatchObject({
      step: 1,
      rankFactor: 2,
      drawdownBand: 0.15,
      tried: [1, 2],
    });
    expect(result.bands.rankMax).toBe(200);
  });

  it("keeps median excess return free of unknown BTC returns", () => {
    // Episode at the very end of the BTC series has no BTC end price.
    const rows = Array.from({ length: 3 }, (_, i) => row(i + 1, "2013-04-28"));
    rows.push(row(9, addWeeks("2013-04-28", 790)));
    const result = analyze(target, 999, rows, btc, new Map());
    const known = result.episodes.filter((e) => e.btcRet104w !== null);
    expect(known).toHaveLength(3);
    expect(result.summary.medianExcessReturn).toBeCloseTo(
      -0.5 - (204 / 100 - 1),
    );
  });

  it("computes the BTC return over the same 104 weeks", () => {
    const result = analyze(target, 999, [row(1, "2013-04-28")], btc, new Map());
    expect(result.episodes[0].btcRet104w).toBeCloseTo(204 / 100 - 1);
  });
});

describe("queryBands", () => {
  it("covers the exact bands with no upper age limit for old coins", () => {
    const q = queryBands(target);
    expect(q.rankMin).toBe(67);
    expect(q.rankMax).toBe(150);
    expect(q.ageMin).toBe(208);
    expect(q.ageMax).toBeNull();
    expect(q.drawdownMin).toBeLessThan(0.7);
  });
});

describe("twinPath", () => {
  it("indexes price relative to BTC at 100 and stops where rows stop", () => {
    const start = "2018-01-07";
    const rows = [
      { week: start, priceUsd: 10 },
      { week: addWeeks(start, 1), priceUsd: 20 },
    ];
    const path = twinPath(start, rows, btc);
    expect(path[0]).toEqual({ t: 0, vsBtc: 100 });
    expect(path[1].t).toBe(1);
    const b0 = btc.get(start)!;
    const b1 = btc.get(addWeeks(start, 1))!;
    expect(path[1].vsBtc).toBeCloseTo((2 / (b1 / b0)) * 100, 2);
    expect(path).toHaveLength(2);
  });
});

describe("snapToSunday", () => {
  it("moves any day back to the Sunday snapshot on or before it", () => {
    expect(snapToSunday("2022-04-03")).toBe("2022-04-03");
    expect(snapToSunday("2022-04-05")).toBe("2022-04-03");
    expect(snapToSunday("2022-04-09")).toBe("2022-04-03");
    expect(snapToSunday("2022-01-01")).toBe("2021-12-26");
  });
});
