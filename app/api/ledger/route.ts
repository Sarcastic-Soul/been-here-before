import { z } from "zod";

import { getLedgerDay, getLedgerDays } from "@/lib/ledger/read";

const Day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)));

const HOW =
  "entriesHash = sha256(lines sorted with a plain string sort, joined by \\n). root = sha256(prevRoot + \\n + day + \\n + entriesHash), with prevRoot 'genesis' on the first day. All hashes are lowercase hex.";

/**
 * GET /api/ledger lists every ledger day with its hashes, newest first.
 * GET /api/ledger?day=2026-11-22 returns that day's exact hashed lines.
 * Reads only from the database, never from CMC.
 */
export async function GET(request: Request) {
  const day = new URL(request.url).searchParams.get("day");
  try {
    if (day === null) {
      return Response.json({ how: HOW, days: await getLedgerDays() });
    }
    const parsed = Day.safeParse(day);
    if (!parsed.success)
      return Response.json(
        { error: "Pass ?day= as YYYY-MM-DD, or no day for the list." },
        { status: 400 },
      );
    const data = await getLedgerDay(parsed.data);
    if (!data)
      return Response.json(
        { error: `No ledger entry for ${parsed.data}.` },
        { status: 404 },
      );
    return Response.json({ how: HOW, ...data });
  } catch (error) {
    console.error("ledger read failed", error);
    return Response.json(
      { error: "The database did not answer. Try again later." },
      { status: 503 },
    );
  }
}
