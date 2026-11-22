import { longDate, relativeToBtc, signedPct } from "@/lib/format";
import { OG_SIZE, plainCard, verdictCard } from "@/lib/og/card";
import { getPastVerdict, snapToSunday } from "@/lib/verdict/get-past-verdict";

export const alt = "What Been Here Before would have said in a past week";
export const size = OG_SIZE;
export const contentType = "image/png";

const SLUG = /^[a-z0-9-]{1,100}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Time machine card: the verdict as of that week, and what really happened. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; week: string }>;
}) {
  const { slug, week } = await params;
  if (
    !SLUG.test(slug) ||
    !DAY.test(week) ||
    Number.isNaN(Date.parse(`${week}T00:00:00Z`))
  )
    return plainCard("Time machine", "Pick a coin and a past week.");
  const data = await getPastVerdict(slug, snapToSunday(week));
  if (data.status !== "ok")
    return plainCard(data.coin?.name ?? "Time machine", data.message);
  const { verdict, actual } = data;
  const relative =
    actual.ret104w === null
      ? null
      : relativeToBtc(actual.ret104w, actual.btcRet104w);
  return verdictCard(verdict, {
    kicker: `Time machine: ${verdict.coin.name} (${verdict.coin.symbol}) in the week of ${longDate(data.asOf)}, using only history known then`,
    right: longDate(data.asOf),
    after:
      actual.complete && relative !== null
        ? `What happened next: ${signedPct(relative)} against BTC over 2 years.`
        : undefined,
  });
}
