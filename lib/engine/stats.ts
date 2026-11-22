export interface Rate {
  k: number;
  n: number;
  p: number;
  lo: number;
  hi: number;
  /**
   * Effective number of independent episodes behind lo and hi, after
   * allowing for episodes that bunch in time. Missing for plain Wilson
   * rates and in old saved copies.
   */
  nEff?: number;
}

/** Wilson score interval. Good for small n and rates near 0 or 1. */
export function wilson(k: number, n: number, z = 1.96): Rate {
  if (n === 0) return { k, n, p: 0, lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    k,
    n,
    p,
    lo: Math.max(0, center - half),
    hi: Math.min(1, center + half),
  };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function rateOf<T>(
  items: readonly T[],
  hit: (item: T) => boolean,
): Rate {
  return wilson(items.filter(hit).length, items.length);
}

/**
 * Calendar half-year of an episode's start week, for example "2022H1".
 * Two episodes that start in the same half-year share at least three
 * quarters of their 104-week outcome window, so their outcomes move together.
 */
export function halfYear(week: string): string {
  const month = Number(week.slice(5, 7));
  return `${week.slice(0, 4)}H${month <= 6 ? 1 : 2}`;
}

/**
 * Design effect of a share whose items come in clusters: the cluster-robust
 * (linearized) variance of k / n divided by the plain binomial variance.
 * Never below 1.
 *
 * When the variance cannot be measured (fewer than two clusters, or every
 * item has the same outcome, so the variance is zero), it assumes the worst
 * case: items in the same cluster move together completely. The design effect
 * is then sum(n_c^2) / n, so the effective n is n^2 / sum(n_c^2), Kish's
 * effective number of clusters. A "0 of 20" spread over a few half-years
 * therefore counts as a handful of independent looks, not 20.
 */
export function designEffect(
  clusters: readonly { k: number; n: number }[],
): number {
  const c = clusters.length;
  const n = clusters.reduce((sum, cl) => sum + cl.n, 0);
  const k = clusters.reduce((sum, cl) => sum + cl.k, 0);
  if (n === 0) return 1;
  if (c < 2 || k === 0 || k === n) {
    const sizes = clusters.reduce((sum, cl) => sum + cl.n * cl.n, 0);
    return Math.max(1, sizes / n);
  }
  const p = k / n;
  const squares = clusters.reduce((sum, cl) => sum + (cl.k - p * cl.n) ** 2, 0);
  const robust = ((c / (c - 1)) * squares) / (n * n);
  const binomial = (p * (1 - p)) / n;
  return Math.max(1, robust / binomial);
}

/**
 * Share of items that hit, with a Wilson interval computed at the effective
 * sample size n / design effect instead of n. k, n and p stay the raw counts.
 * When the design effect cannot be measured the worst case is assumed (see
 * designEffect).
 */
export function clusteredRate<T>(
  items: readonly T[],
  hit: (item: T) => boolean,
  clusterOf: (item: T) => string,
): Rate {
  const byCluster = new Map<string, { k: number; n: number }>();
  for (const item of items) {
    const key = clusterOf(item);
    const cl = byCluster.get(key) ?? { k: 0, n: 0 };
    cl.n += 1;
    if (hit(item)) cl.k += 1;
    byCluster.set(key, cl);
  }
  const k = items.filter(hit).length;
  const n = items.length;
  if (n === 0) return { ...wilson(0, 0), nEff: 0 };
  const nEff = n / designEffect([...byCluster.values()]);
  const adjusted = wilson((k / n) * nEff, nEff);
  return { k, n, p: k / n, lo: adjusted.lo, hi: adjusted.hi, nEff };
}
