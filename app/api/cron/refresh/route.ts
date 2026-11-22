import { revalidateTag } from "next/cache";

import { cronAuthorized } from "@/lib/cron/auth";
import { refreshCurrentState } from "@/lib/cron/refresh";

/**
 * GET /api/cron/refresh. Called once a day by Vercel Cron with
 * `Authorization: Bearer $CRON_SECRET`. The only route that calls CMC.
 * Expires the "daily" cache at once (not stale-while-revalidate) so the
 * prewarm cron 15 minutes later computes fresh verdicts.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await refreshCurrentState();
    revalidateTag("daily", { expire: 0 });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("daily refresh failed", error);
    return Response.json(
      { ok: false, error: "refresh failed, see logs" },
      { status: 500 },
    );
  }
}
