import { z } from "zod";

import { getPastVerdict, snapToSunday } from "@/lib/verdict/get-past-verdict";

const Query = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,100}$/),
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`))),
});

/**
 * GET /api/then?slug=terra-luna&week=2022-04-03. The verdict as it would have
 * been given in that week, using only history known by then, next to what
 * really happened. Reads only from the database, never from CMC.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = Query.safeParse(params);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          "Pass ?slug= with a CMC slug and ?week= with a date, for example ?slug=terra-luna&week=2022-04-03",
      },
      { status: 400 },
    );
  }
  try {
    const data = await getPastVerdict(
      parsed.data.slug,
      snapToSunday(parsed.data.week),
    );
    return Response.json(data, {
      status: data.status === "not_found" ? 404 : 200,
    });
  } catch (error) {
    console.error(`past verdict for ${parsed.data.slug} failed`, error);
    return Response.json(
      { error: "The database did not answer. Try again later." },
      { status: 503 },
    );
  }
}
