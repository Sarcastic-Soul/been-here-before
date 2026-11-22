# Been Here Before

Type a coin. See every past coin that stood in the same spot, and how it ended up against BTC.

**Live:** https://been-here-before.vercel.app · **Track:** Data and Visualisation · Built for the Build with CMC API Hackathon, Round 2 (DoraHacks)

![Filecoin verdict: 7 of 85 past episodes beat holding BTC over the next 2 years](.github/assets/verdict.png)

## What it does

Most crypto charts show one coin. This app asks a different question: _when other coins were where this one is now, what happened next?_

1. You pick a coin, for example Filecoin.
2. The app reads its spot today: rank (after removing stablecoins and wrapped tokens), how far it is below its peak so far, and how long it has been listed on CoinMarketCap.
3. It searches 708 weekly CoinMarketCap snapshots from April 2013 to November 2026, **dead coins included**, for every coin that was once in the same spot.
4. It follows each of those past coins for the next 2 years and counts how many beat simply holding BTC.
5. It gives a plain verdict with the count, a 95% range, the split by halving cycle, the five closest "twins" as a chart, every episode in a table, and a receipts drawer with the CoinMarketCap calls behind the page.

Filecoin today (rank 66, down 99.7% from its peak, listed 8.9 years ago) matches 85 past episodes from 63 different coins. 7 of them beat BTC over 2 years: 8%, with a 95% range of 4–16%. Verdict: **History favors rotating to BTC.**

It is a base rate, not a forecast and not financial advice.

## The rules

All rules are fixed in advance and shown on the [method page](https://been-here-before.vercel.app/method).

| What "same spot" means                                                                           | Match band                                  |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Adjusted rank `r` (rank among coins that are not stablecoins, wrapped, bridged or staked tokens) | `r / 1.5` to `r × 1.5`                      |
| Drawdown: `1 − price / peak so far`                                                              | ±10 percentage points                       |
| Age since CMC listing                                                                            | same bucket: under 1 year, 1–2, 2–4, over 4 |

- **One episode per coin per halving cycle**: the first week it entered the bands. Counting every week would fill the sample with near-copies.
- **No look-ahead.** Features for week W use only data at or before W. A unit test removes every row after W and checks that nothing changes.
- **Dead coins count.** A coin that left the top 5,000 within the 2 years is counted as a total loss, not dropped.
- **Wilson 95% intervals** on every rate, medians (not means) for returns.

| Condition (`p` = share that beat BTC over 2 years, range `[lo, hi]`) | Verdict                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| n < 20                                                               | Not enough history. Shows the closest twins, no verdict. |
| hi < 35%                                                             | History favors rotating to BTC.                          |
| lo > 50%                                                             | History favors holding.                                  |
| otherwise                                                            | No clear edge.                                           |

The app refuses stablecoins, wrapped tokens and BTC itself (BTC is the yardstick), and coins outside adjusted rank 1–1,000.

## Does it work? The honest result

`scripts/calibrate.ts` replays the method at the start of every quarter from January 2018 to October 2024, for every coin ranked 20–500, using only episodes whose 2 years had already ended by that date. Then it checks what really happened.

- 13,435 coin-dates tested, 12,572 got a prediction.
- **"Rotate to BTC" was given 11,368 times, and 91% of those coins did lag BTC** over the next 2 years.
- Brier score 0.0964 against 0.0990 for a baseline that always predicts the overall rate: a small gain (2.6%), not a big one.
- "Hold" never fired. Predictions run a little high (the 15% bucket came true 9% of the time), most likely because the 2017 altcoin boom made earlier cycles kinder to altcoins than 2018–2024.

The method page shows the reliability chart and says all of this in plain words. The thresholds were not tuned after seeing these results.

## CoinMarketCap endpoints used

| Endpoint                                 | Used by                                            | What for                                                                                                                             | Credits seen                              |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `/v1/cryptocurrency/listings/historical` | `scripts/pull-history.ts`                          | One top-5,000 snapshot per Sunday since 28 Apr 2013 (708 snapshots, 2,010,527 rows). This is the whole history behind every verdict. | 1 per 100 coins; 20,306 for the full pull |
| `/v1/cryptocurrency/listings/latest`     | `/api/cron/refresh` (Vercel Cron, daily 01:00 UTC) | Today's rank, price and market cap for the top 2,000                                                                                 | 8 per call                                |
| `/v1/global-metrics/quotes/historical`   | `scripts/pull-global.ts`                           | Weekly total market cap for the market phase label                                                                                   | 8 for 708 weeks                           |
| `/v1/cryptocurrency/map`                 | `scripts/pull-map.ts`                              | Status of every coin id (active, inactive, untracked)                                                                                | 0                                         |
| `/v1/key/info`                           | `scripts/probe.ts`                                 | Plan and credit check before the pull                                                                                                | 0                                         |

Total so far: about 20,400 credits for the one-time history, then 8 credits a day. The plan during the event allows 450,000 credits a month.

**Page views never call CoinMarketCap.** Only the daily cron route and the scripts in `scripts/` do. The API key is read in one file (`lib/cmc/client.ts`, server only), sent only as a header, and never stored with a receipt.

## Evidence of a real API call

The code: the daily cron ([`lib/cron/refresh.ts`](lib/cron/refresh.ts)) makes one call through the shared client ([`lib/cmc/client.ts`](lib/cmc/client.ts)), which sends the key only in the `X-CMC_PRO_API_KEY` header, so the saved request URL never contains it.

```ts
// lib/cron/refresh.ts (constants written out)
result = await cmcGet<RawListing[]>("/v1/cryptocurrency/listings/latest", {
  start: 1,
  limit: 2000,
  convert: "USD",
  aux: "tags,platform,date_added,cmc_rank",
});

// lib/cmc/client.ts
response = await fetch(requestUrl, {
  headers: { Accept: "application/json", "X-CMC_PRO_API_KEY": apiKey() },
  cache: "no-store",
});
```

The response: the cron ran this call on 22 Nov 2026. The request and the response's `status` block, as stored in the `cmc_receipts` table:

```
GET https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=2000&convert=USD&aux=tags%2Cplatform%2Cdate_added%2Ccmc_rank
```

```json
{
  "status": {
    "timestamp": "2026-11-22T12:48:49.405Z",
    "error_code": 0,
    "error_message": null,
    "elapsed": 97,
    "credit_count": 8,
    "notice": null,
    "total_count": 7931
  },
  "data": [
    "... 2,000 rows, including Filecoin's (trimmed):",
    {
      "id": 2280,
      "name": "Filecoin",
      "symbol": "FIL",
      "slug": "filecoin",
      "cmc_rank": 79,
      "date_added": "2017-12-13T00:00:00.000Z",
      "quote": {
        "USD": {
          "price": 0.5338509982622321,
          "last_updated": "2026-11-22T12:48:33.072Z"
        }
      }
    }
  ]
}
```

Every coin page shows the same thing live: open **Receipts** to see the request URL, fetch time, HTTP status, credits used and the coin's row exactly as CoinMarketCap returned it, plus the `listings/historical` call behind each of the five closest twins.

![Receipts drawer showing the listings/latest call and Filecoin's raw row](.github/assets/receipts.png)

## What the API made possible, and where it got in the way

**Made possible**

- `listings/historical` on the Startup plan goes back to 2013 and **still includes coins that are dead today** (BitConnect is in the 2018-01-07 snapshot; 3,434 of the 5,000 coins on 2022-01-02 are untracked now). That is what lets this study avoid counting only survivors, which is the main flaw in most "what happens after a crash" charts.
- `limit=5000` works on `listings/historical`, so one call per week covers the whole market that mattered. 708 weeks cost about 20,000 credits, a small part of one month's plan.
- `/v1/cryptocurrency/map` is free and lists inactive and untracked coins.

**Got in the way**

- The docs do not say whether old snapshots include coins that are inactive today, or what the largest `limit` is. Both decide whether a historical study is even possible; we had to probe to find out.
- Most dead coins are `untracked`, not `inactive` (29,643 against 1,750), and the docs do not explain the difference. A script that pulls only `inactive` misses most dead coins.
- `listings/historical` has no `total_count` in `status` (`listings/latest` does), so you cannot tell whether a snapshot was cut off by `limit`.
- 38 coin ids in the 2022-01-02 snapshot are in none of the three map lists, so names and slugs have to come from the snapshot rows.
- During the 708-call pull, three requests failed at the network level and one returned HTTP 200 with a body that could not be parsed. The client now retries both and refuses to save a snapshot with no rows.
- Tags are today's labels only, with no history. Old coins get tagged "AI" years later, so tags cannot be used for matching without leaking hindsight.
- It is unclear whether stored historical data may back a public site after the event. We asked in the DoraHacks Q&A. After the event the app will run on the Basic plan with the cron only.

## This app's own API

Read routes serve derived statistics from Postgres. Verdicts and the calibration result are cached for a day and refreshed when the daily cron runs.

| Route                            | Returns                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /api/verdict?slug=filecoin` | The full verdict as JSON: state, bands, rates with ranges, per-cycle split, twins with paths, all episodes, evidence |
| `GET /api/coins/search?q=fil`    | Coin suggestions for the search box                                                                                  |
| `GET /api/calibration`           | The walk-forward test result                                                                                         |
| `GET /api/health`                | Database status and data freshness                                                                                   |
| `GET /api/cron/refresh`          | Daily refresh (needs `Authorization: Bearer $CRON_SECRET`)                                                           |

If the database cannot be reached, the 30 coins in `public/precomputed/` (saved by `pnpm data:precompute` from `/api/verdict`, with prices removed) still load, with a banner naming the save date.

## How it is built

```
scripts/ (run once)                         app (Vercel)
  pull-history  -> data/raw/  (gitignored)    /coin/[slug]  -> lib/verdict -> Neon Postgres
  pull-map, pull-global                       /api/*        -> lib/verdict -> Neon Postgres
  build-panel   -> features, outcomes         /api/cron/refresh -> CMC listings/latest -> Neon
  load          -> Neon Postgres
  calibrate     -> walk-forward result
```

- **Panel:** 708 weekly snapshots, 1,310,031 coin-weeks, 7,988 coins, 5,096 of which are no longer in the top 5,000.
- **Engine** (`lib/engine/`): universe filter, lineage table for migrations (MATIC to POL, LEND to AAVE, about 30 more), features, outcomes, matching, Wilson intervals, verdict rule. Pure functions with unit tests on synthetic data.
- **Stack:** Next.js 16 (App Router, Cache Components), React 19, TypeScript 6, Tailwind CSS 4, Drizzle ORM, Neon Postgres, zod, Vitest, Playwright, Phosphor icons. Charts are hand-made SVG.

## Run it locally

Needs Node 26.13+, pnpm 12, a CoinMarketCap API key (Startup plan for history before Nov 2025) and a Postgres database.

```
cp .env.example .env.local      # fill in CMC_API_KEY, DATABASE_URL, DATABASE_URL_UNPOOLED, CRON_SECRET
pnpm install
pnpm db:migrate

pnpm data:probe                 # check plan and credits
pnpm data:pull                  # weekly snapshots since 2013, resumable (about 20,300 credits)
pnpm data:pull:map
pnpm data:pull:global
pnpm data:build                 # build the panel and load it into Postgres
pnpm data:calibrate             # walk-forward test

pnpm dev
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit), `pnpm build`, `pnpm test:e2e` (Playwright smoke, desktop and phone).

No CoinMarketCap data is in this repository. Raw responses stay in `data/`, which is gitignored, and tests use synthetic fixtures.

## Known limits

- CMC's listing date is not the launch date.
- Weekly snapshots miss moves inside a week.
- Leaving the top 5,000 counts as a total loss, which is harsh for the few coins that come back later.
- Before 2017 there were few coins, so early cycles have small samples.
- A base rate from the past does not predict any single coin.

Data provided by [CoinMarketCap.com](https://coinmarketcap.com). Not financial advice.
