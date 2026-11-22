import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshCurrentState = vi.fn();
const revalidateTag = vi.fn();
const prewarm = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cron/prewarm", () => ({ prewarm: () => prewarm() }));

vi.mock("@/lib/cron/refresh", () => ({
  refreshCurrentState: () => refreshCurrentState(),
}));
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
}));

import { GET as prewarmGET } from "@/app/api/cron/prewarm/route";
import { GET } from "@/app/api/cron/refresh/route";

const SECRET = "s3cret-value-abcdef";

function req(authorization?: string) {
  return new Request("http://localhost/api/cron/refresh", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("GET /api/cron/refresh auth", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    refreshCurrentState.mockResolvedValue({ rows: 3 });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    refreshCurrentState.mockReset();
    revalidateTag.mockReset();
  });

  it("returns 401 when CRON_SECRET is not set, even for a matching-looking header", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect((await GET(req(""))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
    expect(refreshCurrentState).not.toHaveBeenCalled();
  });

  it("returns 401 when the header is missing", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(refreshCurrentState).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong secret of the same length", async () => {
    const wrong = "x".repeat(SECRET.length);
    expect((await GET(req(`Bearer ${wrong}`))).status).toBe(401);
    expect(refreshCurrentState).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong length, or the secret without the Bearer prefix", async () => {
    expect((await GET(req(`Bearer ${SECRET}x`))).status).toBe(401);
    expect((await GET(req(`Bearer ${SECRET.slice(1)}`))).status).toBe(401);
    expect((await GET(req(SECRET))).status).toBe(401);
    expect(refreshCurrentState).not.toHaveBeenCalled();
  });

  it("returns 200 and refreshes once for the correct Bearer secret", async () => {
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rows: 3 });
    expect(refreshCurrentState).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("daily", { expire: 0 });
  });

  it("returns 500 without leaking the error message when refresh throws", async () => {
    refreshCurrentState.mockRejectedValue(
      new Error("password=hunter2 db host leaked"),
    );
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("leaked");
    expect(text).not.toContain(SECRET);
    expect(JSON.parse(text)).toEqual({
      ok: false,
      error: "refresh failed, see logs",
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/prewarm auth", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", SECRET);
    prewarm.mockResolvedValue({ warmed: 2, failed: [], ms: 10 });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    prewarm.mockReset();
  });

  it("rejects a wrong secret without warming", async () => {
    const res = await prewarmGET(req("Bearer wrong-value-abcdefg"));
    expect(res.status).toBe(401);
    expect(prewarm).not.toHaveBeenCalled();
  });

  it("warms with the right secret", async () => {
    const res = await prewarmGET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, warmed: 2 });
    expect(prewarm).toHaveBeenCalledTimes(1);
  });

  it("hides the error text when warming fails", async () => {
    prewarm.mockRejectedValue(new Error("connection string leaked"));
    const res = await prewarmGET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("leaked");
  });
});
