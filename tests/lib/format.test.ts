import { describe, expect, it } from "vitest";

import {
  compactUsd,
  drawdownPct,
  longDate,
  monthYear,
  pct,
  pctRange,
  relativeToBtc,
  signedPct,
  usd,
  years,
} from "@/lib/format";

describe("pct", () => {
  it("rounds to whole percent by default", () => {
    expect(pct(0.0823)).toBe("8%");
    expect(pct(0)).toBe("0%");
  });
  it("keeps one decimal for small non-zero shares", () => {
    expect(pct(0.004)).toBe("0.4%");
  });
  it("respects explicit digits", () => {
    expect(pct(0.0823, 1)).toBe("8.2%");
  });
});

describe("drawdownPct", () => {
  it("adds a decimal near 100%", () => {
    expect(drawdownPct(0.9971)).toBe("99.7%");
    expect(drawdownPct(0.42)).toBe("42%");
  });
  it("never shows a listed coin as 100% down", () => {
    expect(drawdownPct(0.99996)).toBe("over 99.9%");
    expect(drawdownPct(1)).toBe("over 99.9%");
  });
});

describe("signedPct", () => {
  it("uses a real minus sign and a plus sign", () => {
    expect(signedPct(1.745)).toBe("+175%");
    expect(signedPct(-0.4)).toBe("−40%");
    expect(signedPct(0.001)).toBe("0%");
  });
  it("adds thousands separators", () => {
    expect(signedPct(12.5)).toBe("+1,250%");
  });
});

describe("relativeToBtc", () => {
  it("compares growth factors, not differences", () => {
    expect(relativeToBtc(1, 1)).toBeCloseTo(0);
    expect(relativeToBtc(-0.5, 0)).toBeCloseTo(-0.5);
    expect(relativeToBtc(0, 1)).toBeCloseTo(-0.5);
  });
  it("returns null when BTC data is missing or wiped out", () => {
    expect(relativeToBtc(0.2, null)).toBeNull();
    expect(relativeToBtc(0.2, -1)).toBeNull();
  });
});

describe("other helpers", () => {
  it("formats ranges, prices and sizes", () => {
    expect(pctRange(0.041, 0.157)).toBe("4–16%");
    expect(pctRange(0, 0.004)).toBe("0–0.4%");
    expect(usd(65432.1)).toBe("$65,432");
    expect(usd(0.5339)).toBe("$0.5339");
    expect(compactUsd(2.3e9)).toBe("$2.3B");
    expect(compactUsd(null)).toBe("n/a");
  });
  it("formats ages", () => {
    expect(years(26)).toBe("6 months");
    expect(years(464)).toBe("8.9 years");
  });
  it("formats dates without time zone shifts", () => {
    expect(longDate("2020-05-17")).toBe("17 May 2020");
    expect(monthYear("2013-04-28T00:00:00Z")).toBe("Apr 2013");
  });
});
