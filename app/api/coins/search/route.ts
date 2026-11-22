import { z } from "zod";

import { searchCoins } from "@/lib/verdict/get-verdict";

const Query = z.object({ q: z.string().trim().min(1).max(50) });

/** GET /api/coins/search?q=fil. Symbol, name or slug; live coins first. */
export async function GET(request: Request) {
  const parsed = Query.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Pass ?q= with 1 to 50 characters" },
      { status: 400 },
    );
  return Response.json({ results: await searchCoins(parsed.data.q) });
}
