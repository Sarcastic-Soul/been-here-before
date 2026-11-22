import { describe, expect, it } from "vitest";

import {
  chainRoot,
  entriesHash,
  GENESIS,
  sha256Hex,
  toLine,
  verifyChain,
} from "@/lib/ledger/chain";
import type { VerdictOk } from "@/lib/verdict/types";

// Synthetic verdict: invented coin and numbers.
function verdict(slug: string, k: number): VerdictOk {
  return {
    status: "ok",
    coin: {
      id: 9001,
      lineageId: 9001,
      name: "Testcoin",
      symbol: "TST",
      slug,
      status: "active",
      dateAdded: null,
    },
    state: {
      asOf: "2026-11-22T01:00:00.000Z",
      source: "daily",
      rankAdj: 42,
      rankRaw: 45,
      priceUsd: 1,
      marketCapUsd: 1e9,
      drawdown: 0.812345678,
      weeksSincePeak: 50,
      ageWeeks: 200,
    },
    bands: {
      rankMin: 28,
      rankMax: 63,
      drawdownMin: 0.71,
      drawdownMax: 0.91,
      ageLabel: "2–4 years",
      step: 1,
    },
    verdict: "rotate",
    verdictText: "History favors rotating to BTC",
    summary: {
      n: 40,
      distinctCoins: 30,
      beatBtc: { k, n: 40, p: k / 40, lo: 0.0512345, hi: 0.2898765 },
      reachedTop20: { k: 0, n: 40, p: 0, lo: 0, hi: 0.08 },
      fellOut: { k: 10, n: 40, p: 0.25, lo: 0.14, hi: 0.4 },
      medianCoinReturn: -0.7,
      medianExcessReturn: -0.6,
    },
    beatBtc1y: { k: 5, n: 40, p: 0.125, lo: 0.05, hi: 0.26 },
    byCycle: [],
    twins: [],
    episodes: [],
    evidence: {
      historyEndpoint: "h",
      stateEndpoint: "s",
      stateSnapshot: "2026-11-22",
      firstWeek: "2013-04-28",
      lastWeek: "2026-11-15",
      lastCompleteStart: "2024-11-03",
    },
  };
}

async function day(dayName: string, prevRoot: string | null, lines: string[]) {
  const hash = await entriesHash(lines);
  return {
    day: dayName,
    count: lines.length,
    entriesHash: hash,
    prevRoot,
    root: await chainRoot(prevRoot, dayName, hash),
    lines,
  };
}

describe("ledger chain", () => {
  it("hashes like sha256sum", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("writes a fixed key order with rounded numbers", () => {
    const line = JSON.parse(toLine(verdict("testcoin", 6), "2026-11-22"));
    expect(Object.keys(line)).toEqual([
      "day",
      "slug",
      "coinId",
      "symbol",
      "asOf",
      "rank",
      "drawdown",
      "ageWeeks",
      "verdict",
      "k",
      "n",
      "lo",
      "hi",
      "step",
      "episodesThrough",
    ]);
    expect(line.drawdown).toBe(0.8123);
    expect(line.lo).toBe(0.0512);
    expect(line.step).toBe(1);
  });

  it("does not depend on line order", async () => {
    const a = toLine(verdict("a", 1), "2026-11-22");
    const b = toLine(verdict("b", 2), "2026-11-22");
    expect(await entriesHash([a, b])).toBe(await entriesHash([b, a]));
  });

  it("chains days from genesis and catches edits", async () => {
    const d1 = await day("2026-11-22", null, [
      toLine(verdict("a", 1), "2026-11-22"),
      toLine(verdict("b", 2), "2026-11-22"),
    ]);
    const d2 = await day("2026-11-23", d1.root, [
      toLine(verdict("a", 3), "2026-11-23"),
    ]);
    expect(d1.root).toBe(
      await sha256Hex(`${GENESIS}\n2026-11-22\n${d1.entriesHash}`),
    );
    expect(await verifyChain([d1, d2])).toEqual({
      ok: true,
      days: 2,
      lines: 3,
    });

    const edited = {
      ...d1,
      lines: [d1.lines[0], toLine(verdict("b", 9), "2026-11-22")],
    };
    expect(await verifyChain([edited, d2])).toMatchObject({
      ok: false,
      day: "2026-11-22",
      reason: "lines do not match their hash",
    });

    const rehashed = await day("2026-11-22", null, edited.lines);
    expect(await verifyChain([rehashed, d2])).toMatchObject({
      ok: false,
      day: "2026-11-23",
      reason: "does not link to the day before",
    });

    expect(await verifyChain([{ ...d1, count: 5 }])).toMatchObject({
      ok: false,
      reason: "line count does not match",
    });
  });
});
