export interface Rate {
  k: number;
  n: number;
  p: number;
  lo: number;
  hi: number;
}

/** Wilson score interval. Good for small n and rates near 0 or 1. */
export function wilson(k: number, n: number, z = 1.96): Rate {
  if (n === 0) return { k, n, p: 0, lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { k, n, p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function rateOf<T>(items: readonly T[], hit: (item: T) => boolean): Rate {
  return wilson(items.filter(hit).length, items.length);
}
