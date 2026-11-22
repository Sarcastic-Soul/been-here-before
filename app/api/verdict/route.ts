import { z } from "zod";

import { getVerdictOrSaved } from "@/lib/verdict/saved";
import { BRIEF, DAILY } from "@/lib/api/cache";

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
  let result: Awaited<ReturnType<typeof getVerdictOrSaved>>;
  try {
    result = await getVerdictOrSaved(parsed.data.slug);
  } catch (error) {
    console.error(`verdict for ${parsed.data.slug} failed`, error);
    return Response.json(
      { error: "The database did not answer and no saved copy exists." },
      { status: 503 },
    );
  }
  const { data, savedAt } = result;
  // savedAt appears only when the database was down and a saved copy was served.
  return Response.json(savedAt ? { ...data, savedAt } : data, {
    status: data.status === "not_found" ? 404 : 200,
    headers: savedAt ? BRIEF : DAILY,
  });
}
