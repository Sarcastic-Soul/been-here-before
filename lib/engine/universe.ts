/**
 * Stablecoins, wrapped, bridged, staked and tokenized-asset coins are removed
 * before ranking. They track something else, so their rank says nothing about
 * a coin's own fate. CMC tags are current labels, which is fine here: being a
 * stablecoin is structural, not hindsight. The liquid-staking tag is not used:
 * it also covers governance tokens such as LDO, RPL and JTO.
 */
const EXCLUDED_TAGS = new Set([
  "stablecoin",
  "asset-backed-stablecoin",
  "usd-stablecoin",
  "fiat-stablecoin",
  "algorithmic-stablecoin",
  "eur-stablecoin",
  "wrapped-tokens",
  "liquid-restaking-tokens",
  "tokenized-gold",
  "tokenized-silver",
  "tokenized-commodities",
  "tokenized-stock",
  "tokenized-treasury-bills",
  "tokenized-treasury-bonds",
]);

/** Names that say the coin tracks another asset. */
const NAME_PATTERN = /\b(wrapped|bridged|staked|restaked|tether|stablecoin|pegged)\b/i;

/** Common wrapper and liquid-staking symbols: WBTC, wstETH, cbETH, rETH, HBTC, BTCB. */
const SYMBOL_PATTERN =
  /^(w|st|wst|cb|r|we|wb|ws|h|t|f|b|v|e|x|sl|slis|solv|xsolv|uni|pump|mgw|bit|open|syrup|ms|puf|pz|sw|os|ez|rs)(btc|eth|sol|bnb|avax|trx|ht|okt|cro|usdc|usdt)x?$|^(btcb|ethx)$/i;

/** Dollar-pegged symbols without tags in old snapshots. */
const DOLLAR_SYMBOL = /^(usd[a-z0-9]{0,2}|[a-z]{0,2}usd|bitusd|bitcny|usnbt|nubits|ustc|usx|eusx)$/i;

/** CMC ids that slip past the rules. Checked against /v1/cryptocurrency/map. */
const EXCLUDED_IDS = new Set<number>([
  825, // USDT, tether
  3408, // USDC, usd-coin
  4687, // BUSD, binance-usd
  4943, // DAI, multi-collateral-dai
  2308, // SAI, single-collateral-dai
  3717, // WBTC, wrapped-bitcoin
  4023, // BTCB, bitcoin-bep2
  2563, // TUSD, trueusd
  3330, // USDP, paxos-standard
  7129, // USTC, terrausd (UST before its collapse)
]);

/** CMC ids the rules catch by mistake. Checked by hand against price history. */
const KEPT_IDS = new Set<number>([
  40, // StableCoin (SBC), a 2013 altcoin whose price moved 100x: only the name says stable
  1229, // DigixDAO (DGD), the governance token, tagged stablecoin because of Digix gold
]);

export interface AssetMeta {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  tags: readonly string[];
}

export function isExcludedAsset(meta: AssetMeta): boolean {
  if (KEPT_IDS.has(meta.id)) return false;
  return (
    EXCLUDED_IDS.has(meta.id) ||
    meta.tags.some((tag) => EXCLUDED_TAGS.has(tag)) ||
    NAME_PATTERN.test(meta.name) ||
    SYMBOL_PATTERN.test(meta.symbol) ||
    DOLLAR_SYMBOL.test(meta.symbol)
  );
}

/** Coins whose own fate we measure against: never treated as pegged to themselves. */
export const REFERENCE_IDS = { btc: 1, eth: 1027, bnb: 1839, sol: 5426 } as const;

/**
 * True when a coin's price stayed locked to a reference (BTC, ETH, USD ...) over
 * its whole history: a wrapper, a liquid-staking token or a stablecoin, even
 * without a tag. Being a wrapper is a fact about the asset, not about how it
 * turned out, so using the whole history here does not leak future returns.
 *
 * The reference must exist for at least 80% of the coin's weeks, so a 2014
 * coin is not called ETH-pegged on the two weeks it overlapped with ETH.
 *
 * @param prices     the coin's prices
 * @param reference  the reference price at the same weeks (1 for USD)
 */
export function looksPegged(prices: readonly number[], reference: readonly number[]): boolean {
  let min = Infinity;
  let max = 0;
  let count = 0;
  let priced = 0;
  for (let i = 0; i < prices.length; i++) {
    if (!(prices[i] > 0)) continue;
    priced++;
    const ref = reference[i];
    if (!(ref > 0)) continue;
    const ratio = prices[i] / ref;
    min = Math.min(min, ratio);
    max = Math.max(max, ratio);
    count++;
  }
  if (count < 2 || count < 0.8 * priced) return false;
  return max / min <= (count >= 8 ? 1.3 : 1.03);
}
