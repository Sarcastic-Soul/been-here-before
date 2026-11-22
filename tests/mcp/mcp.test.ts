import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getVerdictOrSaved = vi.fn();
const searchCoins = vi.fn();
const getCalibration = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/verdict/saved", () => ({
  getVerdictOrSaved: (slug: string) => getVerdictOrSaved(slug),
}));
vi.mock("@/lib/verdict/get-verdict", () => ({
  searchCoins: (query: string) => searchCoins(query),
}));
vi.mock("@/lib/calibration/get-calibration", () => ({
  getCalibration: () => getCalibration(),
}));

import { GET, POST } from "@/app/api/mcp/route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function rpc(method: string, params?: unknown, id: number | string = 1) {
  return post({ jsonrpc: "2.0", id, method, params });
}

function call(name: string, args?: unknown) {
  return rpc("tools/call", { name, arguments: args });
}

// Synthetic data only: invented coins and numbers.
const coin = {
  id: 1,
  lineageId: 1,
  name: "Testcoin",
  symbol: "TST",
  slug: "testcoin",
  status: "active",
  dateAdded: null,
};

function twin(n: number) {
  return {
    episode: {
      name: `Twin ${n}`,
      symbol: `T${n}`,
      week: "2018-01-07",
      ret104w: -0.5,
      beatBtc104w: n % 2 === 0,
      fellOut104w: n === 1,
    },
    path: [{ t: 0, vsBtc: 100 }],
  };
}

const ok = {
  status: "ok",
  coin,
  state: { asOf: "2026-11-15", rankAdj: 50, drawdown: 0.9, ageWeeks: 300 },
  bands: { step: 0, tried: [30], rankMin: 33, rankMax: 75 },
  verdict: "rotate",
  verdictText: "History favors rotating to BTC",
  summary: {
    n: 30,
    distinctCoins: 20,
    beatBtc: { k: 3, n: 30, p: 0.1, lo: 0.03, hi: 0.26, nEff: 12 },
  },
  survivorsOnly: { k: 3, n: 10, p: 0.3, lo: 0.1, hi: 0.6 },
  twins: [1, 2, 3, 4, 5, 6, 7].map(twin),
  episodes: [{ big: "list" }],
};

describe("POST /api/mcp", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    getVerdictOrSaved.mockReset();
    searchCoins.mockReset();
    getCalibration.mockReset();
  });

  it("answers initialize", async () => {
    const res = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
    expect(body.result.protocolVersion).toBe("2025-06-18");
    expect(body.result.serverInfo.name).toBe("been-here-before");
    expect(body.result.capabilities).toEqual({ tools: {} });
  });

  it("answers ping", async () => {
    const body = await (await rpc("ping")).json();
    expect(body.result).toEqual({});
  });

  it("lists the three tools with schemas", async () => {
    const body = await (await rpc("tools/list")).json();
    const tools = body.result.tools as {
      name: string;
      description: string;
      inputSchema: { type: string };
    }[];
    expect(tools.map((t) => t.name)).toEqual([
      "base_rate",
      "search_coins",
      "calibration",
    ]);
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("returns a compact base_rate for status ok", async () => {
    getVerdictOrSaved.mockResolvedValue({ data: ok, savedAt: null });
    const res = await call("base_rate", { coin: "  TestCoin " });
    expect(getVerdictOrSaved).toHaveBeenCalledWith("testcoin");
    const body = await res.json();
    expect(body.result.isError).toBeUndefined();
    const out = JSON.parse(body.result.content[0].text);
    expect(out.coin).toEqual({
      name: "Testcoin",
      symbol: "TST",
      slug: "testcoin",
    });
    expect(out.today).toEqual({
      rank: 50,
      drawdown: 0.9,
      ageWeeks: 300,
      asOf: "2026-11-15",
    });
    expect(out.verdict).toBe("rotate");
    expect(out.episodes).toBe(30);
    expect(out.distinctCoins).toBe(20);
    expect(out.beatBtc).toMatchObject({ k: 3, n: 30, effectiveN: 12 });
    expect(out.survivorsOnly.p).toBe(0.3);
    expect(out.bands).toEqual({ step: 0, tried: [30] });
    expect(out.twins).toHaveLength(5);
    expect(out.twins[0]).toEqual({
      name: "Twin 1",
      symbol: "T1",
      startWeek: "2018-01-07",
      return2y: -0.5,
      beatBtc: false,
      fellOut: true,
    });
    expect(out.savedCopy).toBe(false);
    expect(out.url).toBe("https://been-here-before.vercel.app/coin/testcoin");
    expect(out.note).toMatch(/not a forecast/);
    expect(JSON.stringify(out)).not.toContain("path");
  });

  it("marks a saved copy", async () => {
    getVerdictOrSaved.mockResolvedValue({
      data: ok,
      savedAt: "2026-11-01T00:00:00Z",
    });
    const body = await (await call("base_rate", { coin: "testcoin" })).json();
    const out = JSON.parse(body.result.content[0].text);
    expect(out.savedCopy).toBe(true);
    expect(out.savedAt).toBe("2026-11-01T00:00:00Z");
  });

  it("returns movedTo for a symbol", async () => {
    getVerdictOrSaved.mockResolvedValue({
      data: {
        status: "moved",
        coin: null,
        movedTo: { slug: "testcoin", name: "Testcoin" },
        message: '"tst" is the symbol of Testcoin.',
      },
      savedAt: null,
    });
    const body = await (await call("base_rate", { coin: "TST" })).json();
    expect(getVerdictOrSaved).toHaveBeenCalledWith("tst");
    const out = JSON.parse(body.result.content[0].text);
    expect(out.status).toBe("moved");
    expect(out.movedTo.slug).toBe("testcoin");
    expect(out.note).toMatch(/not financial advice/);
  });

  it("returns the message for not_found", async () => {
    getVerdictOrSaved.mockResolvedValue({
      data: {
        status: "not_found",
        coin: null,
        message: 'No coin with slug "nope".',
      },
      savedAt: null,
    });
    const body = await (await call("base_rate", { coin: "nope" })).json();
    const out = JSON.parse(body.result.content[0].text);
    expect(out.status).toBe("not_found");
    expect(out.message).toBe('No coin with slug "nope".');
  });

  it("sends tool failures back as isError, not a JSON-RPC error", async () => {
    getVerdictOrSaved.mockRejectedValue(new Error("password=hunter2"));
    const body = await (await call("base_rate", { coin: "testcoin" })).json();
    expect(body.error).toBeUndefined();
    expect(body.result.isError).toBe(true);
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("search_coins returns at most 8 hits", async () => {
    searchCoins.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        name: `Coin ${i}`,
        symbol: `C${i}`,
        slug: `coin-${i}`,
        rankAdj: i,
        live: true,
        excluded: false,
      })),
    );
    const body = await (await call("search_coins", { query: "coin" })).json();
    expect(searchCoins).toHaveBeenCalledWith("coin");
    const out = JSON.parse(body.result.content[0].text);
    expect(out.results).toHaveLength(8);
  });

  it("calibration returns the summary without reliability rows", async () => {
    getCalibration.mockResolvedValue({
      horizon: 104,
      tested: 100,
      predicted: 90,
      brier: 0.1,
      brierBaseline: 0.11,
      verdicts: { rotate: { n: 80, beat: 8 } },
      example: null,
      reliability: [{ bucket: "10%", predicted: 0.1, realized: 0.1, n: 5 }],
      detail: {
        gain: 0.09,
        gainInterval: { lo: 0.01, hi: 0.17 },
        byYear: [],
        steps: [],
      },
      computedAt: "2026-11-01T00:00:00.000Z",
    });
    const body = await (await call("calibration")).json();
    const out = JSON.parse(body.result.content[0].text);
    expect(out).toMatchObject({
      tested: 100,
      predicted: 90,
      brier: 0.1,
      baseline: 0.11,
      gain: 0.09,
      gainInterval: { lo: 0.01, hi: 0.17 },
      verdicts: { rotate: { n: 80, beat: 8 } },
    });
    expect(JSON.stringify(out)).not.toContain("reliability");
  });

  it("calibration says so when it has not run", async () => {
    getCalibration.mockResolvedValue(null);
    const body = await (await call("calibration")).json();
    expect(body.result.isError).toBe(true);
  });

  it("returns -32601 for an unknown method", async () => {
    const res = await rpc("resources/list");
    const body = await res.json();
    expect(body.error.code).toBe(-32601);
    expect(body.id).toBe(1);
  });

  it("returns -32602 for an unknown tool, missing name or bad arguments", async () => {
    const unknown = await (await call("nope", {})).json();
    expect(unknown.error.code).toBe(-32602);

    const noName = await (await rpc("tools/call", {})).json();
    expect(noName.error.code).toBe(-32602);

    const missing = await (await call("base_rate", {})).json();
    expect(missing.error.code).toBe(-32602);

    const badSlug = await (await call("base_rate", { coin: "a b/c" })).json();
    expect(badSlug.error.code).toBe(-32602);
    expect(getVerdictOrSaved).not.toHaveBeenCalled();
  });

  it("returns -32700 for malformed JSON", async () => {
    const res = await post("{not json");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
    expect(body.id).toBeNull();
  });

  it("returns -32600 for an invalid request or a batch", async () => {
    const wrong = await post({ jsonrpc: "1.0", id: 1, method: "ping" });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).error.code).toBe(-32600);

    const batch = await post([{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    expect((await batch.json()).error.code).toBe(-32600);
  });

  it("returns 202 with an empty body for a notification", async () => {
    const res = await post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });
});

describe("GET /api/mcp", () => {
  it("returns 405 with Allow: POST", () => {
    const res = GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });
});
