import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { count, drawdownPct, longDate, years } from "@/lib/format";
import type { EpisodeRow, VerdictOk } from "@/lib/verdict/types";

/** Share cards: the answer itself, in the Almanac look, 1200 x 630. */
export const OG_SIZE = { width: 1200, height: 630 };

const PAPER = "#f3eee4";
const INK = "#1d1a16";
const BODY = "#3a352e";
const MUTED = "#6b6357";
const MARK = "#8a8173";
const ACCENT = "#c43d1b";

async function fonts() {
  const dir = join(process.cwd(), "assets", "fonts");
  const [serif, sans, sansBold, mono] = await Promise.all([
    readFile(join(dir, "newsreader-latin-400-normal.woff")),
    readFile(join(dir, "ibm-plex-sans-latin-400-normal.woff")),
    readFile(join(dir, "ibm-plex-sans-latin-600-normal.woff")),
    readFile(join(dir, "ibm-plex-mono-latin-400-normal.woff")),
  ]);
  return [
    { name: "Newsreader", data: serif, weight: 400 as const },
    { name: "Plex", data: sans, weight: 400 as const },
    { name: "Plex", data: sansBold, weight: 600 as const },
    { name: "Mono", data: mono, weight: 400 as const },
  ];
}

function Dots({ episodes }: { episodes: EpisodeRow[] }) {
  const sorted = [...episodes].sort(
    (a, b) =>
      Number(b.beatBtc104w) - Number(a.beatBtc104w) ||
      a.week.localeCompare(b.week),
  );
  const boxW = 400;
  const boxH = 330;
  const n = Math.max(1, sorted.length);
  const cols = Math.max(5, Math.ceil(Math.sqrt((n * boxW) / boxH)));
  const rows = Math.ceil(n / cols);
  const step = Math.min(boxW / cols, boxH / rows, 46);
  const size = Math.max(4, Math.floor(step * 0.74));
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        width: cols * step,
        alignContent: "flex-start",
      }}
    >
      {sorted.map((e) => (
        <div
          key={`${e.lineageId}-${e.week}`}
          style={{
            width: step,
            height: step,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: size,
              height: size,
              borderRadius: size,
              background: e.beatBtc104w ? ACCENT : "transparent",
              border: e.beatBtc104w
                ? "none"
                : `${Math.max(1.5, size / 9)}px solid ${MARK}`,
              opacity: e.fellOut104w ? 0.55 : 1,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function Frame({
  kicker,
  right,
  children,
}: {
  kicker: string;
  right: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: PAPER,
        color: INK,
        padding: "52px 64px 44px",
        fontFamily: "Plex",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderBottom: `2px solid ${INK}`,
          paddingBottom: 18,
        }}
      >
        <div style={{ fontFamily: "Newsreader", fontSize: 34 }}>
          Been Here Before
        </div>
        <div style={{ fontFamily: "Mono", fontSize: 20, color: MUTED }}>
          {right}
        </div>
      </div>
      <div style={{ fontSize: 22, color: MUTED, marginTop: 22 }}>{kicker}</div>
      <div style={{ display: "flex", flex: 1, marginTop: 6 }}>{children}</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 19,
          color: MUTED,
          borderTop: `1px solid #d8cfbf`,
          paddingTop: 14,
        }}
      >
        <div>
          Weekly CoinMarketCap snapshots since 2013, dead coins included
        </div>
        <div style={{ fontFamily: "Mono", color: INK }}>
          been-here-before.vercel.app
        </div>
      </div>
    </div>
  );
}

/** The verdict card, used by the coin page and the time machine. */
export async function verdictCard(
  data: VerdictOk,
  extra?: { kicker?: string; right?: string; after?: string },
) {
  const { coin, state, summary } = data;
  const refused = data.verdict === "not_enough_history";
  const kicker =
    extra?.kicker ??
    `${coin.name} (${coin.symbol}) · rank ${state.rankAdj} · down ${drawdownPct(state.drawdown)} from its peak · listed ${years(state.ageWeeks)} ago`;
  return new ImageResponse(
    <Frame
      kicker={kicker}
      right={extra?.right ?? `as of ${longDate(state.asOf)}`}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          paddingRight: 40,
        }}
      >
        <div
          style={{
            fontFamily: "Newsreader",
            fontSize: 58,
            lineHeight: 1.05,
            marginTop: 8,
            letterSpacing: "-0.015em",
          }}
        >
          {refused ? "Not enough history to say." : `${data.verdictText}.`}
        </div>
        {refused ? (
          <div style={{ fontSize: 28, color: BODY, marginTop: 28 }}>
            {`Only ${summary.n} past ${summary.n === 1 ? "episode matches" : "episodes match"} this spot, so no rate is given.`}
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              marginTop: 18,
            }}
          >
            <div
              style={{
                fontFamily: "Newsreader",
                fontSize: 170,
                lineHeight: 0.82,
                color: ACCENT,
              }}
            >
              {String(summary.beatBtc.k)}
            </div>
            <div
              style={{
                fontFamily: "Newsreader",
                fontSize: 64,
                lineHeight: 1,
                marginLeft: 18,
                marginBottom: 4,
              }}
            >
              {`of ${count(summary.beatBtc.n)}`}
            </div>
          </div>
        )}
        {!refused && (
          <div
            style={{ fontSize: 27, color: BODY, marginTop: 22, maxWidth: 600 }}
          >
            past coins in this spot beat holding BTC over the next 2 years.
          </div>
        )}
        {extra?.after && (
          <div
            style={{
              fontSize: 27,
              color: INK,
              fontWeight: 600,
              marginTop: 18,
              borderLeft: `4px solid ${ACCENT}`,
              paddingLeft: 14,
            }}
          >
            {extra.after}
          </div>
        )}
      </div>
      {data.episodes.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", paddingTop: 8 }}>
          <Dots episodes={data.episodes} />
        </div>
      )}
    </Frame>,
    { ...OG_SIZE, fonts: await fonts() },
  );
}

/** A plain card with a title and a line, for the home page and refusals. */
export async function plainCard(title: string, line: string, kicker = "") {
  return new ImageResponse(
    <Frame kicker={kicker} right="weekly since 2013">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          flex: 1,
        }}
      >
        <div
          style={{
            fontFamily: "Newsreader",
            fontSize: 76,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            maxWidth: 980,
          }}
        >
          {title}
        </div>
        <div
          style={{ fontSize: 30, color: BODY, marginTop: 26, maxWidth: 900 }}
        >
          {line}
        </div>
      </div>
    </Frame>,
    { ...OG_SIZE, fonts: await fonts() },
  );
}
