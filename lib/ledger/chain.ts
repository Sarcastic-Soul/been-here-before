/**
 * The prediction ledger's hash chain. Pure and safe to import anywhere,
 * including the browser, so anyone can check the chain with the same code.
 *
 * Each day stores one canonical JSON line per coin. The day's entries hash is
 * SHA-256 of the lines sorted (plain JavaScript string sort) and joined with
 * "\n". The day's root is SHA-256 of `${prevRoot}\n${day}\n${entriesHash}`,
 * with prevRoot "genesis" for the first day. Changing any old line changes
 * that day's root and breaks every link after it.
 */
import type { VerdictOk } from "@/lib/verdict/types";

export const GENESIS = "genesis";

/** One coin's verdict as written to the ledger. Key order is fixed. */
export interface LedgerLine {
  day: string;
  slug: string;
  coinId: number;
  symbol: string;
  /** When the coin's state was read from CoinMarketCap. */
  asOf: string;
  rank: number;
  drawdown: number;
  ageWeeks: number;
  verdict: VerdictOk["verdict"];
  /** Past episodes that beat BTC, out of n, with the 95% range. */
  k: number;
  n: number;
  lo: number;
  hi: number;
  /** Which widening step matched. */
  step: number;
  /** Latest episode start week whose 2-year outcome was used. */
  episodesThrough: string;
}

export interface LedgerDay {
  day: string;
  count: number;
  entriesHash: string;
  prevRoot: string | null;
  root: string;
}

const round = (value: number) => Number(value.toFixed(4));

export function toLine(data: VerdictOk, day: string): string {
  const { coin, state, summary } = data;
  const line: LedgerLine = {
    day,
    slug: coin.slug,
    coinId: coin.id,
    symbol: coin.symbol,
    asOf: state.asOf,
    rank: state.rankAdj,
    drawdown: round(state.drawdown),
    ageWeeks: state.ageWeeks,
    verdict: data.verdict,
    k: summary.beatBtc.k,
    n: summary.beatBtc.n,
    lo: round(summary.beatBtc.lo),
    hi: round(summary.beatBtc.hi),
    step: data.bands.step ?? 0,
    episodesThrough: data.evidence.lastCompleteStart,
  };
  return JSON.stringify(line);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function entriesHash(lines: readonly string[]): Promise<string> {
  return sha256Hex([...lines].sort().join("\n"));
}

export function chainRoot(
  prevRoot: string | null,
  day: string,
  hash: string,
): Promise<string> {
  return sha256Hex(`${prevRoot ?? GENESIS}\n${day}\n${hash}`);
}

export type ChainCheck =
  | { ok: true; days: number; lines: number }
  | { ok: false; day: string; reason: string };

/**
 * Recomputes every day's hashes from its lines and checks each day points at
 * the one before. Days must be in date order, oldest first.
 */
export async function verifyChain(
  days: readonly (LedgerDay & { lines: readonly string[] })[],
): Promise<ChainCheck> {
  let prev: string | null = null;
  let total = 0;
  for (const day of days) {
    if (day.prevRoot !== prev)
      return {
        ok: false,
        day: day.day,
        reason: "does not link to the day before",
      };
    if (day.lines.length !== day.count)
      return { ok: false, day: day.day, reason: "line count does not match" };
    const hash = await entriesHash(day.lines);
    if (hash !== day.entriesHash)
      return {
        ok: false,
        day: day.day,
        reason: "lines do not match their hash",
      };
    if ((await chainRoot(day.prevRoot, day.day, hash)) !== day.root)
      return { ok: false, day: day.day, reason: "root does not match" };
    prev = day.root;
    total += day.lines.length;
  }
  return { ok: true, days: days.length, lines: total };
}
