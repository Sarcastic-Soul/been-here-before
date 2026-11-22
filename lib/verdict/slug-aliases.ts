/**
 * Slugs people paste from other sites (mostly CoinGecko ids) mapped to the
 * CoinMarketCap slug the app uses. Migrations such as MATIC to POL are handled
 * by the lineage rules, not here.
 */
export const SLUG_ALIASES: Readonly<Record<string, string>> = {
  "matic-network": "polygon",
  binancecoin: "bnb",
  ripple: "xrp",
  "avalanche-2": "avalanche",
  polkadot: "polkadot-new",
  "hedera-hashgraph": "hedera",
};
