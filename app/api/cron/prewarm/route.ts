import { cronAuthorized } from "@/lib/cron/auth";
import { prewarm } from "@/lib/cron/prewarm";

export const maxDuration = 300;

/**
 * GET /api/cron/prewarm. Runs by Vercel Cron 15 minutes after the daily
 * refresh, and by `pnpm data:prewarm` after a deploy (a new deploy starts with
 * an empty cache). Reads only our database, never CMC.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request))
    return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await prewarm()) });
  } catch (error) {
    console.error("prewarm failed", error);
    return Response.json(
      { ok: false, error: "prewarm failed, see logs" },
      { status: 500 },
    );
  }
}
