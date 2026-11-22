import { beforeEach, describe, expect, it, vi } from "vitest";

const cmcGet = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cmc/client", () => ({
  cmcGet: (...args: unknown[]) => cmcGet(...args),
  CmcError: class CmcError extends Error {},
}));

import { refreshGlobalMetrics } from "@/lib/cron/refresh";

// Synthetic answer in the shape of global-metrics/quotes/latest; not real data.
const receipt = {
  endpoint: "/v1/global-metrics/quotes/latest",
  requestUrl:
    "https://pro-api.coinmarketcap.com/v1/global-metrics/quotes/latest?convert=USD",
  fetchedAt: "2030-01-05T01:00:00.000Z",
  httpStatus: 200,
  creditCount: 1,
  errorCode: null,
  errorMessage: null,
};

function fakeSql() {
  const calls: { text: string; params: unknown[] }[] = [];
  const sql = {
    query: vi.fn(async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return [];
    }),
  };
  return { sql: sql as never, calls };
}

describe("refreshGlobalMetrics", () => {
  beforeEach(() => cmcGet.mockReset());

  it("logs the credit and stores the answer as a receipt", async () => {
    const data = {
      btc_dominance: 55.5,
      quote: { USD: { total_market_cap: 1e12 } },
    };
    cmcGet.mockResolvedValue({ data, body: { status: {}, data }, receipt });
    const { sql, calls } = fakeSql();

    const result = await refreshGlobalMetrics(sql);

    expect(cmcGet).toHaveBeenCalledWith("/v1/global-metrics/quotes/latest", {
      convert: "USD",
    });
    expect(result).toEqual({
      totalMarketCap: 1e12,
      btcDominance: 55.5,
      credits: 1,
    });
    expect(calls[0].text).toContain("INSERT INTO credit_log");
    expect(calls[1].text).toContain("'global_metrics_latest'");
    expect(calls[1].params[5]).toBe(JSON.stringify({ status: {}, data }));
  });

  it("refuses an answer without a total market cap", async () => {
    const data = { btc_dominance: 55.5, quote: { USD: {} } };
    cmcGet.mockResolvedValue({ data, body: { data }, receipt });
    const { sql, calls } = fakeSql();

    await expect(refreshGlobalMetrics(sql)).rejects.toThrow(
      "no total market cap",
    );
    // The credit is still logged; no receipt is stored.
    expect(calls).toHaveLength(1);
  });
});
