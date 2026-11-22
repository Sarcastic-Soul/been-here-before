/**
 * Saves the verdict for 30 well-known coins to public/precomputed/, so the
 * coin pages still work if the database is down (lib/verdict/saved.ts).
 *
 * Reads our own /api/verdict, never CoinMarketCap. Keeps derived statistics
 * only: today's price and market cap are removed, and twin paths are
 * already ratios to BTC, not prices.
 *
 *   pnpm data:precompute                     # from the live site
 *   BASE_URL=http://localhost:3000 pnpm data:precompute
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { VerdictOk, VerdictResponse } from "@/lib/verdict/types";

const BASE_URL = process.env.BASE_URL ?? "https://been-here-before.vercel.app";
const OUT_DIR = join(process.cwd(), "public", "precomputed");
const WANT = 30;

/** Well-known coins in rough market-cap order; extras cover any refusals. */
const CANDIDATES = [
  "ethereum",
  "xrp",
  "bnb",
  "solana",
  "dogecoin",
  "cardano",
  "tron",
  "chainlink",
  "avalanche",
  "stellar",
  "sui",
  "hedera",
  "bitcoin-cash",
  "litecoin",
  "shiba-inu",
  "polkadot-new",
  "toncoin",
  "uniswap",
  "near-protocol",
  "aptos",
  "internet-computer",
  "ethereum-classic",
  "pepe",
  "monero",
  "cosmos",
  "filecoin",
  "algorand",
  "arbitrum",
  "render",
  "tezos",
  "the-sandbox",
  "decentraland",
  "axie-infinity",
  "eos",
  "theta-network",
  "iota",
  "neo",
  "zcash",
];

const NOTE =
  "Derived statistics from weekly CoinMarketCap snapshots, saved by scripts/precompute.ts as a fallback. Data provided by CoinMarketCap.com. Not financial advice.";

async function fetchVerdict(slug: string): Promise<VerdictResponse | null> {
  const response = await fetch(`${BASE_URL}/api/verdict?slug=${slug}`);
  if (!response.ok) {
    console.warn(`  ${slug}: HTTP ${response.status}, skipped`);
    return null;
  }
  return (await response.json()) as VerdictResponse;
}

function derivedOnly(verdict: VerdictOk): VerdictOk {
  return {
    ...verdict,
    state: { ...verdict.state, priceUsd: null, marketCapUsd: null },
  };
}

async function main() {
  console.log(`Reading verdicts from ${BASE_URL}`);
  const saved: { slug: string; name: string; verdict: string; n: number }[] =
    [];
  const savedAt = new Date().toISOString();
  const files = new Map<string, string>();

  for (const slug of CANDIDATES) {
    if (saved.length >= WANT) break;
    const result = await fetchVerdict(slug);
    if (!result) continue;
    if (result.status !== "ok") {
      console.warn(`  ${slug}: ${result.status}, skipped`);
      continue;
    }
    if ("savedAt" in result) {
      throw new Error(
        `${slug} came from a saved copy; the live database is down, try later`,
      );
    }
    const body = { savedAt, note: NOTE, verdict: derivedOnly(result) };
    files.set(`${slug}.json`, JSON.stringify(body));
    saved.push({
      slug,
      name: result.coin.name,
      verdict: result.verdictText,
      n: result.summary.n,
    });
    console.log(`  ${slug}: ${result.verdictText} (n=${result.summary.n})`);
  }

  if (saved.length < WANT) {
    throw new Error(`only ${saved.length} of ${WANT} coins answered`);
  }

  // Replace the folder only once every fetch has worked.
  await mkdir(OUT_DIR, { recursive: true });
  for (const name of await readdir(OUT_DIR)) {
    if (name.endsWith(".json")) await rm(join(OUT_DIR, name));
  }
  for (const [name, body] of files) {
    await writeFile(join(OUT_DIR, name), body);
  }
  await writeFile(
    join(OUT_DIR, "index.json"),
    JSON.stringify({ savedAt, note: NOTE, coins: saved }, null, 2),
  );
  console.log(`Saved ${saved.length} verdicts to public/precomputed/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
