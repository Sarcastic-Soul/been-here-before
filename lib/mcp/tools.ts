import "server-only";

import { z } from "zod";

import { getCalibration } from "@/lib/calibration/get-calibration";
import { snapToSunday } from "@/lib/verdict/analyze";
import { getPastVerdict } from "@/lib/verdict/get-past-verdict";
import { searchCoins } from "@/lib/verdict/get-verdict";
import { getVerdictOrSaved } from "@/lib/verdict/saved";
import { SITE } from "@/lib/site";
import type { VerdictOk, VerdictRefused } from "@/lib/verdict/types";

export { SITE };

const NOTE =
  "This is a historical base rate, not a forecast and not financial advice.";

/** What a tool hands back inside a tools/call result. */
export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Checks and cleans the arguments. A failure becomes a JSON-RPC -32602. */
  args: z.ZodType<Record<string, unknown>>;
  run: (args: never) => Promise<ToolResult>;
}

function json(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function toolError(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const Slug = /^[a-z0-9-]{1,100}$/;

const BaseRateArgs = z.object({
  coin: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((value) => value.toLowerCase())
    .refine((value) => Slug.test(value), {
      message: "coin must be a CMC slug like filecoin, or a symbol like FIL",
    }),
});

const ReplayArgs = z.object({
  coin: BaseRateArgs.shape.coin,
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "week must be YYYY-MM-DD" })
    .refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)), {
      message: "week must be a real date",
    }),
});

const SearchArgs = z.object({ query: z.string().trim().min(1).max(50) });

const NoArgs = z.object({});

function compactOk(data: VerdictOk, savedAt: string | null) {
  const { coin, state, bands, summary } = data;
  return {
    coin: { name: coin.name, symbol: coin.symbol, slug: coin.slug },
    today: {
      rank: state.rankAdj,
      drawdown: state.drawdown,
      ageWeeks: state.ageWeeks,
      asOf: state.asOf,
    },
    verdict: data.verdict,
    verdictText: data.verdictText,
    episodes: summary.n,
    distinctCoins: summary.distinctCoins,
    beatBtc: {
      k: summary.beatBtc.k,
      n: summary.beatBtc.n,
      p: summary.beatBtc.p,
      lo: summary.beatBtc.lo,
      hi: summary.beatBtc.hi,
      effectiveN: summary.beatBtc.nEff ?? null,
    },
    survivorsOnly: data.survivorsOnly
      ? {
          k: data.survivorsOnly.k,
          n: data.survivorsOnly.n,
          p: data.survivorsOnly.p,
          lo: data.survivorsOnly.lo,
          hi: data.survivorsOnly.hi,
        }
      : null,
    bands: { step: bands.step ?? null, tried: bands.tried ?? null },
    twins: data.twins.slice(0, 5).map(({ episode }) => ({
      name: episode.name,
      symbol: episode.symbol,
      startWeek: episode.week,
      return2y: episode.ret104w,
      beatBtc: episode.beatBtc104w,
      fellOut: episode.fellOut104w,
    })),
    savedCopy: savedAt !== null,
    savedAt,
    url: `${SITE}/coin/${coin.slug}`,
    note: NOTE,
  };
}

function compactRefused(data: VerdictRefused) {
  return {
    status: data.status,
    message: data.message,
    ...(data.movedTo
      ? {
          movedTo: {
            ...data.movedTo,
            url: `${SITE}/coin/${data.movedTo.slug}`,
          },
        }
      : {}),
    ...(data.lastSeen ? { lastSeen: data.lastSeen } : {}),
    note: NOTE,
  };
}

const baseRate: Tool = {
  name: "base_rate",
  description:
    "Look up a coin on Been Here Before. Finds past coins that stood in the same spot (adjusted rank, drawdown from peak, age) in weekly CoinMarketCap snapshots since 2013, dead coins included, and returns how many beat holding BTC over the next 2 years, with a 95% range, the closest twins and a plain verdict. A historical base rate, not a forecast.",
  inputSchema: {
    type: "object",
    properties: {
      coin: {
        type: "string",
        description:
          'CoinMarketCap slug such as "filecoin", or a ticker symbol such as "FIL". Case does not matter.',
      },
    },
    required: ["coin"],
    additionalProperties: false,
  },
  args: BaseRateArgs,
  run: async ({ coin }: z.infer<typeof BaseRateArgs>) => {
    try {
      const { data, savedAt } = await getVerdictOrSaved(coin);
      return json(
        data.status === "ok" ? compactOk(data, savedAt) : compactRefused(data),
      );
    } catch (error) {
      console.error(`mcp base_rate for ${coin} failed`, error);
      return toolError(
        "The database did not answer and no saved copy exists. Try again later.",
      );
    }
  },
};

const replay: Tool = {
  name: "replay",
  description:
    "Time machine: the verdict Been Here Before would have given for a coin in a past week, using only past coins whose 2-year outcome was already known then, next to what really happened over the following 2 years and whether the call held up. Needs the coin's CMC slug (use search_coins first for a symbol).",
  inputSchema: {
    type: "object",
    properties: {
      coin: {
        type: "string",
        description: 'CoinMarketCap slug such as "terra-luna".',
      },
      week: {
        type: "string",
        description:
          "A date, YYYY-MM-DD, from 2015-05-10 on. It snaps to the Sunday snapshot on or before it.",
      },
    },
    required: ["coin", "week"],
    additionalProperties: false,
  },
  args: ReplayArgs,
  run: async ({ coin, week }: z.infer<typeof ReplayArgs>) => {
    try {
      const data = await getPastVerdict(coin, snapToSunday(week));
      if (data.status !== "ok")
        return json({ status: data.status, message: data.message, note: NOTE });
      const { verdict, actual } = data;
      const call = verdict.verdict;
      const scored = call === "rotate" || call === "hold";
      return json({
        coin: {
          name: verdict.coin.name,
          symbol: verdict.coin.symbol,
          slug: verdict.coin.slug,
        },
        week: data.asOf,
        then: {
          rank: verdict.state.rankAdj,
          drawdown: verdict.state.drawdown,
          ageWeeks: verdict.state.ageWeeks,
          marketPhase: data.market?.phase ?? null,
        },
        verdict: call,
        verdictText: verdict.verdictText,
        beatBtc: {
          k: verdict.summary.beatBtc.k,
          n: verdict.summary.beatBtc.n,
          lo: verdict.summary.beatBtc.lo,
          hi: verdict.summary.beatBtc.hi,
        },
        episodesStartedBy: data.cutoff,
        actual: {
          complete: actual.complete,
          return2y: actual.ret104w,
          btcReturn2y: actual.btcRet104w,
          beatBtc: actual.beatBtc104w,
          fellOut: actual.fellOut104w,
        },
        callHeldUp:
          scored && actual.beatBtc104w !== null
            ? (call === "hold") === actual.beatBtc104w
            : null,
        url: `${SITE}/then/${verdict.coin.slug}/${data.asOf}`,
        note: NOTE,
      });
    } catch (error) {
      console.error(`mcp replay for ${coin} failed`, error);
      return toolError("The database did not answer. Try again later.");
    }
  },
};

const search: Tool = {
  name: "search_coins",
  description:
    "Find coins by ticker symbol, name or slug (up to 8 hits, live coins first). Use it to get the slug to pass to base_rate. Each hit says whether the coin is live today and whether it is excluded (stablecoin, wrapped or similar).",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "1 to 50 characters: a symbol, a name or a slug prefix.",
        minLength: 1,
        maxLength: 50,
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  args: SearchArgs,
  run: async ({ query }: z.infer<typeof SearchArgs>) => {
    try {
      const hits = await searchCoins(query);
      return json({ results: hits.slice(0, 8) });
    } catch (error) {
      console.error("mcp search_coins failed", error);
      return toolError("The coin search failed. Try again later.");
    }
  },
};

const calibration: Tool = {
  name: "calibration",
  description:
    "The walk-forward test of the method: it replays the verdicts at the start of every quarter from 2018 and checks what really happened over the next 2 years. Returns coin-dates tested, predictions made, Brier score against the baseline, the gain with its 95% range, and how often each verdict was given.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  args: NoArgs,
  run: async () => {
    try {
      const result = await getCalibration();
      if (!result) return toolError("The calibration test has not run yet.");
      return json({
        horizonWeeks: result.horizon,
        tested: result.tested,
        predicted: result.predicted,
        brier: result.brier,
        baseline: result.brierBaseline,
        gain: result.detail?.gain ?? null,
        gainInterval: result.detail?.gainInterval ?? null,
        verdicts: result.verdicts,
        computedAt: result.computedAt,
        url: `${SITE}/method`,
        note: NOTE,
      });
    } catch (error) {
      console.error("mcp calibration failed", error);
      return toolError("The calibration lookup failed. Try again later.");
    }
  },
};

export const TOOLS: readonly Tool[] = [baseRate, replay, search, calibration];
