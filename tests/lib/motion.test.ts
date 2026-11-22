import { describe, expect, it } from "vitest";

import { dotTimeline } from "@/lib/motion";

describe("dotTimeline", () => {
  it("lands the dots that beat BTC after every other dot", () => {
    const t = dotTimeline(85, 8);
    expect(t.beatStart).toBeGreaterThan(t.start + t.restWindow);
    expect(t.restWindow).toBeLessThanOrEqual(700);
    expect(t.beatWindow).toBeLessThanOrEqual(520);
  });

  it("handles grids with no winners or only winners", () => {
    expect(dotTimeline(20, 0).beatWindow).toBe(0);
    const all = dotTimeline(6, 6);
    expect(all.restWindow).toBe(0);
    expect(all.beatStart).toBe(all.start);
  });

  it("keeps the whole entrance short even for big grids", () => {
    const t = dotTimeline(560, 65);
    expect(t.beatStart + t.beatWindow).toBeLessThan(1700);
  });
});
