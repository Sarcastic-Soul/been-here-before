import { getCalibration } from "@/lib/calibration/get-calibration";

/** GET /api/calibration. Walk-forward test of the verdicts, 2018 onward. */
export async function GET() {
  const calibration = await getCalibration();
  if (!calibration) return Response.json({ error: "calibration has not run yet" }, { status: 503 });
  return Response.json(calibration);
}
