import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

function connectError(code: string) {
  return Object.assign(new TypeError("fetch failed"), { cause: { code } });
}

describe("Neon fetch retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function loadFetch() {
    process.env.DATABASE_URL ??= "postgresql://u:p@example.invalid/db";
    const { neonConfig } = await import("@neondatabase/serverless");
    const { db } = await import("@/lib/db/client");
    db();
    return neonConfig.fetchFunction as typeof fetch;
  }

  it("retries a connect timeout, then succeeds", async () => {
    const ok = new Response("{}");
    const mock = vi
      .fn()
      .mockRejectedValueOnce(connectError("ETIMEDOUT"))
      .mockResolvedValueOnce(ok);
    vi.stubGlobal("fetch", mock);
    const fetchFn = await loadFetch();
    await expect(fetchFn("https://example.invalid")).resolves.toBe(ok);
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("does not retry errors that may happen after the request was sent", async () => {
    const mock = vi.fn().mockRejectedValue(connectError("ECONNRESET"));
    vi.stubGlobal("fetch", mock);
    const fetchFn = await loadFetch();
    await expect(fetchFn("https://example.invalid")).rejects.toThrow(
      "fetch failed",
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("gives up after three attempts", async () => {
    const mock = vi.fn().mockRejectedValue(connectError("ETIMEDOUT"));
    vi.stubGlobal("fetch", mock);
    const fetchFn = await loadFetch();
    await expect(fetchFn("https://example.invalid")).rejects.toThrow();
    expect(mock).toHaveBeenCalledTimes(3);
  });
});
