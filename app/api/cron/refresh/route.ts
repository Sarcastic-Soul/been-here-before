import { timingSafeEqual } from "node:crypto";

import { revalidateTag } from "next/cache";

import { refreshCurrentState } from "@/lib/cron/refresh";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * GET /api/cron/refresh. Called once a day by Vercel Cron with
 * `Authorization: Bearer $CRON_SECRET`. The only route that calls CMC.
 */
export async function GET(request: Request) {
  if (!authorized(request))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await refreshCurrentState();
    revalidateTag("daily", "max");
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("daily refresh failed", error);
    return Response.json(
      { ok: false, error: "refresh failed, see logs" },
      { status: 500 },
    );
  }
}
