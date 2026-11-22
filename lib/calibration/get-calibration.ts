import "server-only";

import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db/client";
import { calibrationPoints, calibrationSummary } from "@/lib/db/schema";

import type { YearScore } from "./score";

export interface ReliabilityRow {
  bucket: string;
  predicted: number;
  realized: number;
  n: number;
}

export interface Calibration {
  horizon: number;
  tested: number;
  predicted: number;
  brier: number;
  brierBaseline: number;
  verdicts: Record<string, { n: number; beat: number }>;
  example: Record<string, unknown> | null;
  reliability: ReliabilityRow[];
  /** Missing before the second calibration run. */
  detail: CalibrationDetail | null;
  computedAt: string;
}

export interface CalibrationDetail {
  gain: number;
  gainInterval: { lo: number; hi: number };
  byYear: YearScore[];
  /** Predictions per widening step; index 0 is the standard match. */
  steps: number[];
}

/** Walk-forward results written by scripts/calibrate.ts. Null until it has run. */
export async function getCalibration(
  horizon = 104,
): Promise<Calibration | null> {
  "use cache: remote";
  cacheLife("days");
  cacheTag("history");

  const [summary] = await db()
    .select()
    .from(calibrationSummary)
    .where(eq(calibrationSummary.horizon, horizon));
  if (!summary) return null;
  const points = await db()
    .select()
    .from(calibrationPoints)
    .where(eq(calibrationPoints.horizon, horizon));

  const byBucket = new Map<string, ReliabilityRow>();
  for (const point of points) {
    const row = byBucket.get(point.bucket) ?? {
      bucket: point.bucket,
      predicted: 0,
      realized: 0,
      n: 0,
    };
    row.predicted += point.predicted * point.n;
    row.realized += point.realized * point.n;
    row.n += point.n;
    byBucket.set(point.bucket, row);
  }
  const reliability = [...byBucket.values()]
    .map((row) => ({
      ...row,
      predicted: row.predicted / row.n,
      realized: row.realized / row.n,
    }))
    .sort((a, b) => parseInt(a.bucket) - parseInt(b.bucket));

  return {
    horizon,
    tested: summary.tested,
    predicted: summary.n,
    brier: summary.brier,
    brierBaseline: summary.brierBaseline,
    verdicts: (summary.verdictsJson ?? {}) as Calibration["verdicts"],
    example: (summary.exampleJson ?? null) as Calibration["example"],
    reliability,
    detail: (summary.detailJson ?? null) as CalibrationDetail | null,
    computedAt: summary.computedAt.toISOString(),
  };
}
