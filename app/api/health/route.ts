import { connection } from "next/server";

import { healthCheck } from "@/lib/verdict/get-verdict";

/** GET /api/health. Database reachable, last snapshot week, age of today's state. */
export async function GET() {
  await connection();
  try {
    const row = await healthCheck();
    const ageHours = row.stateAsOf
      ? (Date.now() - Date.parse(row.stateAsOf)) / 3_600_000
      : null;
    return Response.json({
      ok: true,
      ...row,
      stateAgeHours: ageHours === null ? null : Math.round(ageHours),
    });
  } catch (error) {
    console.error("health check failed", error);
    return Response.json(
      { ok: false, error: "database unavailable" },
      { status: 503 },
    );
  }
}
