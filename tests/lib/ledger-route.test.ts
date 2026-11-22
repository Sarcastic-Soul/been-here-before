import { afterEach, describe, expect, it, vi } from "vitest";

const getLedgerDays = vi.fn();
const getLedgerDay = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ledger/read", () => ({
  getLedgerDays: () => getLedgerDays(),
  getLedgerDay: (day: string) => getLedgerDay(day),
}));

import { GET } from "@/app/api/ledger/route";

const get = (query = "") =>
  GET(new Request(`http://localhost/api/ledger${query}`));

// Synthetic ledger day.
const day = {
  day: "2026-11-22",
  count: 1,
  entriesHash: "a".repeat(64),
  prevRoot: null,
  root: "b".repeat(64),
};

describe("GET /api/ledger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    getLedgerDays.mockReset();
    getLedgerDay.mockReset();
  });

  it("lists days with the hashing rule", async () => {
    getLedgerDays.mockResolvedValue([day]);
    const body = await (await get()).json();
    expect(body.days).toEqual([day]);
    expect(body.how).toMatch(/sha256/);
  });

  it("returns one day's lines, 404 for a missing day, 400 for a bad one", async () => {
    getLedgerDay.mockImplementation(async (d: string) =>
      d === day.day ? { ...day, lines: ['{"slug":"x"}'] } : null,
    );
    const ok = await get("?day=2026-11-22");
    expect(ok.status).toBe(200);
    expect((await ok.json()).lines).toHaveLength(1);
    expect((await get("?day=2026-11-23")).status).toBe(404);
    expect((await get("?day=22-11-2026")).status).toBe(400);
    expect(getLedgerDay).toHaveBeenCalledTimes(2);
  });

  it("answers 503 without leaking the error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getLedgerDays.mockRejectedValue(new Error("password=hunter2"));
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("hunter2");
  });
});
