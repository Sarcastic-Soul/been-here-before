/**
 * Fills the shared cache on the live site after a deploy (a new deploy starts
 * with an empty cache). Calls our own /api/cron/prewarm with CRON_SECRET from
 * .env.local; never prints the secret and never calls CoinMarketCap.
 *
 *   pnpm data:prewarm
 *   BASE_URL=http://localhost:3000 pnpm data:prewarm
 */
const BASE_URL = process.env.BASE_URL ?? "https://been-here-before.vercel.app";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is not set");

const started = Date.now();
const response = await fetch(`${BASE_URL}/api/cron/prewarm`, {
  headers: { authorization: `Bearer ${secret}` },
});
const body: unknown = await response.json().catch(() => null);
console.log(
  response.status,
  JSON.stringify(body),
  `${Date.now() - started} ms`,
);
if (!response.ok) process.exit(1);

export {};
