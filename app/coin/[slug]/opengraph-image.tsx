import { OG_SIZE, plainCard, verdictCard } from "@/lib/og/card";
import { getVerdictOrSaved } from "@/lib/verdict/saved";

export const alt = "The verdict for this coin on Been Here Before";
export const size = OG_SIZE;
export const contentType = "image/png";

const SLUG = /^[a-z0-9-]{1,100}$/;

/** The share card shows the answer: the verdict, "k of n" and the dot grid. */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = (await params).slug.toLowerCase();
  if (!SLUG.test(slug))
    return plainCard("No coin by that name.", "Try another coin.");
  const { data } = await getVerdictOrSaved(slug);
  if (data.status === "ok") return verdictCard(data);
  if (data.status === "moved" && data.movedTo)
    return plainCard(
      `${data.coin?.name ?? "This coin"} moved to ${data.movedTo.name}.`,
      "Open the link to see the verdict for the live coin.",
    );
  return plainCard(
    data.coin?.name ?? "No coin by that name.",
    data.coin ? data.message : "Try another coin.",
  );
}
