import type { SeriesPoint } from "./types";

/**
 * Coins that moved to a new CMC id. A migration is not a death.
 *
 * - "migration": one coin under a new id. The successor joins the old lineage,
 *   and its price is converted to old-coin units with `ratio`.
 * - "merge": the old coin was swapped into a coin that already had its own
 *   history (AGIX into FET). The old lineage ends at the swap, and its returns
 *   are followed through the successor's price, but the successor stays its own
 *   lineage so nothing is counted twice.
 *
 * `ratio` = units of the new coin received for 1 unit of the old coin.
 * `switchDate` = first Sunday on which the successor's price is used.
 *
 * Collapses are not joined: LUNA kept CMC id 4172 and became LUNC, so its crash
 * already sits in that id's history and counts as a loss.
 */
export interface LineageRule {
  from: number;
  to: number;
  ratio: number;
  switchDate: string;
  kind: "migration" | "merge";
  note: string;
}

export const LINEAGE_RULES: readonly LineageRule[] = [
  {
    from: 1904,
    to: 3077,
    ratio: 100,
    switchDate: "2018-08-05",
    kind: "migration",
    note: "VEN to VET mainnet swap, 1 VEN = 100 VET (VeChain, Jul 2018)",
  },
  {
    from: 1776,
    to: 3635,
    ratio: 27.643,
    switchDate: "2020-08-02",
    kind: "merge",
    note: "MCO to CRO swap, 1 MCO = 27.643 CRO (Crypto.com, Aug 2020)",
  },
  {
    from: 2239,
    to: 7278,
    ratio: 0.01,
    switchDate: "2020-10-04",
    kind: "migration",
    note: "LEND to AAVE, 100 LEND = 1 AAVE (Aave, Oct 2020)",
  },
  {
    from: 2603,
    to: 9040,
    ratio: 0.001,
    switchDate: "2021-04-04",
    kind: "migration",
    note: "NPXS to PUNDIX redenomination, 1000 NPXS = 1 PUNDIX (Pundi X, Apr 2021)",
  },
  {
    from: 1982,
    to: 9444,
    ratio: 1,
    switchDate: "2021-08-01",
    kind: "migration",
    note: "KNC legacy to KNC v2, 1:1 (Kyber, Jul 2021)",
  },
  {
    from: 3718,
    to: 16086,
    ratio: 1000,
    switchDate: "2022-01-16",
    kind: "migration",
    note: "BTTOLD to BTT redenomination, 1 BTTOLD = 1000 BTT (BitTorrent, Jan 2022)",
  },
  {
    from: 5566,
    to: 17751,
    ratio: 4.78318863,
    switchDate: "2022-02-13",
    kind: "merge",
    note: "KEEP to T, 1 KEEP = 4.783 T (Threshold, Jan 2022)",
  },
  {
    from: 4761,
    to: 17751,
    ratio: 3.25924249,
    switchDate: "2022-02-13",
    kind: "merge",
    note: "NU to T, 1 NU = 3.259 T (Threshold, Jan 2022)",
  },
  {
    from: 2424,
    to: 3773,
    ratio: 0.43335,
    switchDate: "2024-07-07",
    kind: "merge",
    note: "AGIX to FET (ASI alliance), 1 AGIX = 0.43335 FET (Jul 2024)",
  },
  {
    from: 3911,
    to: 3773,
    ratio: 0.433226,
    switchDate: "2024-07-07",
    kind: "merge",
    note: "OCEAN to FET (ASI alliance), 1 OCEAN = 0.433226 FET (Jul 2024)",
  },
  {
    from: 3890,
    to: 28321,
    ratio: 1,
    switchDate: "2024-09-08",
    kind: "migration",
    note: "MATIC to POL, 1:1 (Polygon, Sep 2024)",
  },
  {
    from: 3513,
    to: 32684,
    ratio: 1,
    switchDate: "2025-01-05",
    kind: "migration",
    note: "FTM to S, 1:1 (Sonic, Jan 2025)",
  },
  {
    from: 1765,
    to: 36462,
    ratio: 1,
    switchDate: "2025-06-01",
    kind: "migration",
    note: "EOS to A, 1:1 (Vaulta, May 2025)",
  },
];

/** CMC id to lineage root id, after applying migrations (not merges). */
export function lineageRootOf(
  rules: readonly LineageRule[] = LINEAGE_RULES,
): Map<number, number> {
  const parent = new Map<number, number>();
  for (const rule of rules)
    if (rule.kind === "migration") parent.set(rule.to, rule.from);
  const root = new Map<number, number>();
  for (const id of parent.keys()) {
    let current = id;
    while (parent.has(current)) current = parent.get(current)!;
    root.set(id, current);
  }
  return root;
}

/**
 * Root-lineage price units per unit of each migrated id. VET is 100 because
 * 1 VEN became 100 VET, so a VET price times 100 is comparable with VEN history.
 * Ids not in the map use 1. Merges are not included: the merged coin's series ends.
 */
export function priceFactorOf(
  rules: readonly LineageRule[] = LINEAGE_RULES,
): Map<number, number> {
  const factor = new Map<number, number>();
  for (const rule of rules) {
    if (rule.kind === "migration")
      factor.set(rule.to, (factor.get(rule.from) ?? 1) * rule.ratio);
  }
  return factor;
}

/**
 * Join per-id weekly points into lineage series.
 *
 * @param pointsById  points per CMC id, each sorted by week, prices in own units
 * @param switchWeek  maps a rule's switchDate to a week index
 * @returns points per lineage root id, sorted by week, prices in root units
 */
export function assembleLineages(
  pointsById: ReadonlyMap<number, readonly SeriesPoint[]>,
  switchWeek: (day: string) => number,
  rules: readonly LineageRule[] = LINEAGE_RULES,
): Map<number, SeriesPoint[]> {
  const ruleFrom = new Map(rules.map((rule) => [rule.from, rule]));
  const rootOf = lineageRootOf(rules);
  const roots = new Set<number>();
  for (const id of pointsById.keys()) roots.add(rootOf.get(id) ?? id);

  const lineages = new Map<number, SeriesPoint[]>();
  for (const root of roots) {
    const series: SeriesPoint[] = [];
    let id = root;
    let factor = 1; // root units per unit of the current id
    let fromWeek = -Infinity;

    // Own points until the switch, then the successor's, along the chain.
    for (;;) {
      const rule = ruleFrom.get(id);
      const until = rule ? switchWeek(rule.switchDate) : Infinity;
      for (const point of pointsById.get(id) ?? []) {
        if (point.week >= fromWeek && point.week < until) {
          series.push({ ...point, price: point.price * factor });
        }
      }
      if (!rule) break;
      if (rule.kind === "merge") {
        for (const point of pointsById.get(rule.to) ?? []) {
          if (point.week >= until) {
            series.push({
              ...point,
              price: point.price * factor * rule.ratio,
              continuation: true,
            });
          }
        }
        break;
      }
      factor *= rule.ratio;
      fromWeek = until;
      id = rule.to;
    }
    if (series.length)
      lineages.set(
        root,
        series.sort((a, b) => a.week - b.week),
      );
  }
  return lineages;
}
