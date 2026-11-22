/** Display helpers. Pure, safe on server and client. */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKS_PER_YEAR = 52.18;

/** 0.0823 -> "8%". Small non-zero shares keep one decimal so they never read as 0. */
export function pct(share: number, digits = 0): string {
  const value = share * 100;
  if (digits === 0 && value > 0 && value < 1) return `${value.toFixed(1)}%`;
  return `${value.toFixed(digits)}%`;
}

/** Wilson range as "4–16%". */
export function pctRange(lo: number, hi: number): string {
  return `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;
}

/**
 * Drawdowns near 100% need a decimal: 0.9971 -> "99.7%". Every coin in a
 * snapshot still has a price, so it never reads as "100%", even when the
 * stored value rounds to 1: 0.99996 -> "over 99.9%".
 */
export function drawdownPct(drawdown: number): string {
  if (drawdown >= 0.9995) return "over 99.9%";
  return pct(drawdown, drawdown >= 0.9 && drawdown < 1 ? 1 : 0);
}

/** Signed return: 1.745 -> "+175%", -0.4 -> "−40%". */
export function signedPct(ret: number): string {
  const value = Math.round(ret * 100);
  if (value === 0) return "0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString("en-US")}%`;
}

/**
 * How a coin did against BTC over the same window, as one number:
 * (1 + coin return) / (1 + BTC return) - 1. -0.15 means it ended 15% behind BTC.
 */
export function relativeToBtc(
  coinReturn: number,
  btcReturn: number | null,
): number | null {
  if (btcReturn === null || btcReturn <= -1) return null;
  return (1 + coinReturn) / (1 + btcReturn) - 1;
}

export function usd(price: number): string {
  if (price >= 1000) return `$${Math.round(price).toLocaleString("en-US")}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(3)}`;
}

export function compactUsd(value: number | null): string {
  if (value === null) return "n/a";
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (value >= size)
      return `$${(value / size).toFixed(value / size >= 100 ? 0 : 1)}${suffix}`;
  }
  return `$${Math.round(value)}`;
}

export function years(weeks: number): string {
  const y = weeks / WEEKS_PER_YEAR;
  if (y < 1) return `${Math.max(1, Math.round(weeks / 4.35))} months`;
  return `${y < 10 ? y.toFixed(1) : Math.round(y)} years`;
}

function parts(day: string) {
  const [y, m, d] = day.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

/** "2020-05-17" -> "17 May 2020". */
export function longDate(day: string): string {
  const { y, m, d } = parts(day);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "2020-05-17" -> "May 2020". */
export function monthYear(day: string): string {
  const { y, m } = parts(day);
  return `${MONTHS[m - 1]} ${y}`;
}

export function count(value: number): string {
  return value.toLocaleString("en-US");
}
