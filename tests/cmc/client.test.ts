import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

const KEY = "test-key-123";

function ok(
  data: unknown = { hello: "world" },
  status: Record<string, unknown> = {},
) {
  return new Response(
    JSON.stringify({
      status: {
        error_code: 0,
        error_message: null,
        credit_count: 1,
        ...status,
      },
      data,
    }),
    { status: 200 },
  );
}

function httpError(code: number) {
  return new Response(
    JSON.stringify({
      status: { error_code: code, error_message: `boom ${code}` },
    }),
    { status: code },
  );
}

async function load() {
  return import("@/lib/cmc/client");
}

/** Run a call to completion while fake timers skip the backoff waits. */
async function settle<T>(promise: Promise<T>) {
  const outcome = promise.then(
    (value) => ({ value }) as { value: T; error?: undefined },
    (error: unknown) => ({ error }) as { value?: undefined; error: unknown },
  );
  await vi.runAllTimersAsync();
  return outcome;
}

describe("cmcGet", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("CMC_API_KEY", KEY);
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the key only in the header, never in the URL or receipt", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const { cmcGet } = await load();
    const { receipt, body, data } = await cmcGet(
      "/v1/cryptocurrency/listings/latest",
      { start: 1, limit: 5, skipped: undefined },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ "X-CMC_PRO_API_KEY": KEY });
    expect(url).not.toContain(KEY);
    expect(url).toBe(
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?start=1&limit=5",
    );
    expect(receipt.requestUrl).toBe(url);
    expect(receipt.requestUrl).not.toContain(KEY);
    expect(JSON.stringify(receipt)).not.toContain(KEY);
    expect(JSON.stringify({ data, body, receipt })).not.toContain(KEY);
    expect(receipt).toMatchObject({
      endpoint: "/v1/cryptocurrency/listings/latest",
      httpStatus: 200,
      creditCount: 1,
      errorCode: 0,
      errorMessage: null,
    });
    expect(data).toEqual({ hello: "world" });
  });

  it("validates data with the schema when given one", async () => {
    fetchMock.mockResolvedValueOnce(ok({ n: 3 }));
    const { cmcGet } = await load();
    const { data } = await cmcGet("/x", {}, z.object({ n: z.number() }));
    expect(data).toEqual({ n: 3 });

    fetchMock.mockResolvedValueOnce(ok({ n: "nope" }));
    await expect(
      cmcGet("/x", {}, z.object({ n: z.number() })),
    ).rejects.toThrow();
  });

  it("rejects at once when CMC_API_KEY is missing and never calls fetch", async () => {
    vi.stubEnv("CMC_API_KEY", "");
    const { cmcGet } = await load();
    await expect(cmcGet("/x")).rejects.toThrow("CMC_API_KEY is not set");
    const { error } = await settle(cmcGet("/x"));
    expect((error as Error).message).toBe("CMC_API_KEY is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a network error, then succeeds", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(ok());
    const { cmcGet } = await load();
    const { value, error } = await settle(cmcGet("/x"));
    expect(error).toBeUndefined();
    expect(value?.data).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up on a network error after 5 attempts and rethrows it", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const { cmcGet } = await load();
    const { error } = await settle(cmcGet("/x"));
    expect(error).toBeInstanceOf(TypeError);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("retries 429 and 5xx, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(httpError(429))
      .mockResolvedValueOnce(httpError(503))
      .mockResolvedValueOnce(ok());
    const { cmcGet } = await load();
    const { value, error } = await settle(cmcGet("/x"));
    expect(error).toBeUndefined();
    expect(value?.receipt.httpStatus).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("backs off 2s, 4s, 8s between retries", async () => {
    fetchMock
      .mockResolvedValueOnce(httpError(500))
      .mockResolvedValueOnce(httpError(500))
      .mockResolvedValueOnce(httpError(500))
      .mockResolvedValueOnce(ok());
    const { cmcGet } = await load();
    const promise = cmcGet("/x");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await expect(promise).resolves.toMatchObject({ data: { hello: "world" } });
  });

  it("throws CmcError after 5 attempts of persistent 5xx, receipt has no key", async () => {
    fetchMock.mockImplementation(async () => httpError(502));
    const { cmcGet, CmcError } = await load();
    const { error } = await settle(cmcGet("/x", { a: 1 }));
    expect(error).toBeInstanceOf(CmcError);
    const receipt = (error as InstanceType<typeof CmcError>).receipt;
    expect(receipt.httpStatus).toBe(502);
    expect(receipt.errorCode).toBe(502);
    expect(JSON.stringify(receipt)).not.toContain(KEY);
    expect((error as Error).message).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("does not retry other 4xx errors", async () => {
    fetchMock.mockResolvedValueOnce(httpError(401));
    const { cmcGet, CmcError } = await load();
    const { error } = await settle(cmcGet("/x"));
    expect(error).toBeInstanceOf(CmcError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 200 with an unreadable body, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("<html>cut off", { status: 200 }))
      .mockResolvedValueOnce(ok());
    const { cmcGet } = await load();
    const { value, error } = await settle(cmcGet("/x"));
    expect(error).toBeUndefined();
    expect(value?.data).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 200 whose body has no data", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: { error_code: 0 } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(ok());
    const { cmcGet } = await load();
    const { value } = await settle(cmcGet("/x"));
    expect(value?.data).toEqual({ hello: "world" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws CmcError when a 200 body stays unreadable after all retries", async () => {
    fetchMock.mockImplementation(
      async () => new Response("nope", { status: 200 }),
    );
    const { cmcGet, CmcError } = await load();
    const { error } = await settle(cmcGet("/x"));
    expect(error).toBeInstanceOf(CmcError);
    expect((error as InstanceType<typeof CmcError>).receipt.httpStatus).toBe(
      200,
    );
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("turns a CMC error response (non-zero error_code) into CmcError with a clean receipt", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: {
            error_code: "1008",
            error_message: "rate limit hit",
            credit_count: 0,
          },
          data: null,
        }),
        { status: 200 },
      ),
    );
    const { cmcGet, CmcError } = await load();
    const { error } = await settle(cmcGet("/x"));
    expect(error).toBeInstanceOf(CmcError);
    const err = error as InstanceType<typeof CmcError>;
    expect(err.name).toBe("CmcError");
    expect(err.receipt).toMatchObject({
      endpoint: "/x",
      httpStatus: 200,
      errorCode: 1008,
      errorMessage: "rate limit hit",
      creditCount: 0,
    });
    expect(err.message).toContain("rate limit hit");
    expect(err.message).not.toContain(KEY);
    expect(err.receipt.requestUrl).not.toContain(KEY);
    expect(JSON.stringify(err.receipt)).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
