/** Well-known moments to replay in the time machine. Safe to import anywhere. */
export interface FamousCase {
  slug: string;
  /** A Sunday snapshot week, YYYY-MM-DD. */
  week: string;
  name: string;
  /** One line on what happened next, in plain words. */
  story: string;
}

export const FAMOUS_CASES: readonly FamousCase[] = [
  {
    slug: "terra-luna",
    week: "2022-04-03",
    // CoinMarketCap now lists the old chain as Terra Classic, so the page does too.
    name: "Terra Classic (LUNC)",
    story:
      "Then called Terra (LUNA): top 10 at its all-time high, five weeks before it collapsed.",
  },
  {
    slug: "ftx-token",
    week: "2022-10-02",
    name: "FTX Token (FTT)",
    story: "Rank 19 and two-thirds off its peak, a month before FTX went bust.",
  },
  {
    slug: "bitconnect",
    week: "2017-12-10",
    name: "BitConnect (BCC)",
    story: "Rank 16 at its peak, weeks before it shut down as a fraud.",
  },
  {
    slug: "cardano",
    week: "2018-01-07",
    name: "Cardano (ADA)",
    story: "Rank 5 at the very top of the 2017 bubble.",
  },
  {
    slug: "filecoin",
    week: "2021-04-04",
    name: "Filecoin (FIL)",
    story: "Rank 11 at its all-time high in the 2021 run.",
  },
  {
    slug: "solana",
    week: "2021-01-03",
    name: "Solana (SOL)",
    story:
      "Rank 101 and half off its peak, before the 2021 run took it into the top 10.",
  },
  {
    slug: "axie-infinity",
    week: "2021-01-03",
    name: "Axie Infinity (AXS)",
    story: "A young game token near rank 300, before play-to-earn took off.",
  },
];

/**
 * First week with any finished 2-year history behind it: the first weekly
 * snapshot (2013-04-28) plus 106 weeks.
 */
export const FIRST_REPLAY_WEEK = "2015-05-10";

export function thenHref(slug: string, week: string) {
  return `/then/${slug}/${week}`;
}
