import { describe, expect, it } from "vitest";

import { assembleLineages, LINEAGE_RULES, lineageRootOf, type LineageRule } from "@/lib/engine/lineage";
import type { SeriesPoint } from "@/lib/engine/types";

import { point } from "./helpers";

const MATIC = 3890;
const POL = 28321;
const LUNA = 4172;

const weekOf = (day: string) => (day === "2024-09-08" ? 10 : day === "2024-07-07" ? 5 : 0);

describe("lineage", () => {
  it("keeps MATIC and POL as one coin", () => {
    const byId = new Map<number, SeriesPoint[]>([
      [MATIC, [0, 5, 9, 10, 11].map((w) => point(w, 1, { coinId: MATIC }))],
      [POL, [3, 9, 10, 11, 12].map((w) => point(w, 2, { coinId: POL }))],
    ]);
    const lineages = assembleLineages(byId, weekOf);
    expect([...lineages.keys()]).toEqual([MATIC]);
    const series = lineages.get(MATIC)!;
    expect(series.map((p) => [p.week, p.coinId])).toEqual([
      [0, MATIC],
      [5, MATIC],
      [9, MATIC],
      [10, POL],
      [11, POL],
      [12, POL],
    ]);
    expect(lineageRootOf().get(POL)).toBe(MATIC);
  });

  it("converts successor prices with the swap ratio", () => {
    const rules: LineageRule[] = [
      { from: 1, to: 2, ratio: 0.01, switchDate: "2024-09-08", kind: "migration", note: "" },
    ];
    const byId = new Map([
      [1, [point(9, 1, { coinId: 1 })]],
      [2, [point(10, 100, { coinId: 2 })]],
    ]);
    const series = assembleLineages(byId, weekOf, rules).get(1)!;
    expect(series.map((p) => p.price)).toEqual([1, 1]);
  });

  it("follows a merge through the successor without joining the lineages", () => {
    const rules: LineageRule[] = [
      { from: 1, to: 2, ratio: 0.5, switchDate: "2024-07-07", kind: "merge", note: "" },
    ];
    const byId = new Map([
      [1, [point(4, 1, { coinId: 1 })]],
      [2, [point(4, 2, { coinId: 2 }), point(5, 2, { coinId: 2 })]],
    ]);
    const lineages = assembleLineages(byId, weekOf, rules);
    expect([...lineages.keys()].sort()).toEqual([1, 2]);
    const merged = lineages.get(1)!;
    expect(merged.map((p) => [p.week, p.price, p.continuation])).toEqual([
      [4, 1, false],
      [5, 1, true],
    ]);
    expect(lineages.get(2)!).toHaveLength(2);
  });

  it("treats LUNA's collapse as a death, not a migration", () => {
    expect(LINEAGE_RULES.some((rule) => rule.from === LUNA || rule.to === LUNA)).toBe(false);
  });

  it("has one rule per old id and switch dates on Sundays", () => {
    const froms = LINEAGE_RULES.map((rule) => rule.from);
    expect(new Set(froms).size).toBe(froms.length);
    for (const rule of LINEAGE_RULES) {
      expect(new Date(`${rule.switchDate}T00:00:00Z`).getUTCDay()).toBe(0);
    }
  });
});
