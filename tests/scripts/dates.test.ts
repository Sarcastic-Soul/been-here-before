import { describe, expect, it } from "vitest";

import {
  sundayOnOrBefore,
  sundaysBetween,
  parseDay,
  formatDay,
} from "@/scripts/lib/dates";

describe("dates", () => {
  it("finds the Sunday on or before a date", () => {
    expect(formatDay(sundayOnOrBefore(parseDay("2026-11-22")))).toBe(
      "2026-11-22",
    );
    expect(formatDay(sundayOnOrBefore(parseDay("2026-11-21")))).toBe(
      "2026-11-15",
    );
  });

  it("lists every Sunday in a range, inclusive", () => {
    expect(sundaysBetween("2013-04-28", "2013-05-12")).toEqual([
      "2013-04-28",
      "2013-05-05",
      "2013-05-12",
    ]);
  });

  it("starts from the Sunday before a mid-week start date", () => {
    expect(sundaysBetween("2013-05-01", "2013-05-06")).toEqual([
      "2013-04-28",
      "2013-05-05",
    ]);
  });
});
