import { describe, expect, it } from "vitest";

import { computeFeatures } from "@/lib/engine/features";

import { point, seeded, weekDates } from "./helpers";

describe("computeFeatures", () => {
  it("uses a running peak, not the all-time peak", () => {
    const dates = weekDates(4);
    const features = computeFeatures(
      [point(0, 10), point(1, 5), point(2, 20), point(3, 15)],
      dates,
      "2017-12-31",
    );
    expect(features.map((f) => f?.runningPeak)).toEqual([10, 10, 20, 20]);
    expect(features[1]?.drawdown).toBeCloseTo(0.5);
    expect(features[3]?.drawdown).toBeCloseTo(0.25);
    expect(features[3]?.weeksSincePeak).toBe(1);
  });

  it("computes age from date_added, or first sighting if date_added is later", () => {
    const dates = weekDates(60);
    const listed = computeFeatures([point(52, 1)], dates, "2018-01-07");
    expect(listed[0]?.ageWeeks).toBe(52);
    const lateDate = computeFeatures(
      [point(10, 1), point(20, 1)],
      dates,
      "2019-06-01",
    );
    expect(lateDate.map((f) => f?.ageWeeks)).toEqual([0, 10]);
  });

  it("gives continuation points no features", () => {
    const features = computeFeatures(
      [point(0, 10), point(1, 4, { continuation: true })],
      weekDates(2),
      null,
    );
    expect(features[1]).toBeNull();
  });

  it("never looks ahead: deleting future rows leaves past features unchanged", () => {
    const random = seeded(42);
    const dates = weekDates(300);
    const points = [];
    let price = 1;
    for (let week = 0; week < 300; week++) {
      price *= Math.exp((random() - 0.5) * 0.4);
      if (random() > 0.1) points.push(point(week, price));
    }
    const full = computeFeatures(points, dates, "2017-11-01");
    for (const cut of [5, 50, 137, 222]) {
      const kept = points.filter((p) => p.week <= cut);
      const truncated = computeFeatures(kept, dates, "2017-11-01");
      expect(truncated).toEqual(full.slice(0, kept.length));
    }
  });
});
