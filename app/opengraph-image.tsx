import { OG_SIZE, plainCard } from "@/lib/og/card";

export const alt =
  "Been Here Before: every coin that stood where yours stands now, and how many beat holding BTC.";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return plainCard(
    "Every coin that stood where yours stands now.",
    "Type a coin. See every past coin with the same rank, age and drop from its peak, dead coins included, and how many beat simply holding BTC over the next two years.",
  );
}
