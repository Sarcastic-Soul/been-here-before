import type { SeriesPoint } from "@/lib/engine/types";

/** Synthetic weekly dates starting 2018-01-07 (a Sunday). */
export function weekDates(count: number, start = "2018-01-07"): string[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(t0 + i * 7 * 86_400_000).toISOString().slice(0, 10),
  );
}

export function point(week: number, price: number, extra: Partial<SeriesPoint> = {}): SeriesPoint {
  return {
    week,
    coinId: 1000,
    rankRaw: 100,
    rankAdj: 100,
    price,
    marketCap: price * 1e6,
    volume24h: 0,
    continuation: false,
    ...extra,
  };
}

/** Deterministic pseudo-random numbers so tests are repeatable. */
export function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}
