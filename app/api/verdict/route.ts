import { z } from "zod";

import { getVerdict } from "@/lib/verdict/get-verdict";

const Query = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,100}$/) });

/** GET /api/verdict?slug=filecoin. Reads only from the database, never from CMC. */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = Query.safeParse(params);
  if (!parsed.success) {
    return Response.json(
      { error: "Pass ?slug= with a CMC slug, for example ?slug=filecoin" },
      { status: 400 },
    );
  }
  const result = await getVerdict(parsed.data.slug);
  return Response.json(result, {
    status: result.status === "not_found" ? 404 : 200,
  });
}
