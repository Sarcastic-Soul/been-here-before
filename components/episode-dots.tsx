import type { CSSProperties } from "react";

import { longDate, relativeToBtc, signedPct } from "@/lib/format";
import { dotTimeline } from "@/lib/motion";
import type { EpisodeRow } from "@/lib/verdict/types";

import { DotsHover } from "./dots-hover";

type Outcome = "beat" | "lagged" | "fell";

function outcomeOf(episode: EpisodeRow): Outcome {
  if (episode.beatBtc104w) return "beat";
  return episode.fellOut104w ? "fell" : "lagged";
}

const ORDER: Record<Outcome, number> = { beat: 0, lagged: 1, fell: 2 };
const TEXT: Record<Outcome, string> = {
  beat: "Beat BTC.",
  lagged: "Lagged BTC.",
  fell: "Fell out of the top 5,000, counted as a total loss.",
};

/** Key shared by a dot, its twin line and its row: lineage plus start week. */
export function episodeKey(episode: { lineageId: number; week: string }) {
  return `${episode.lineageId}-${episode.week}`;
}

function tipFor(episode: EpisodeRow, outcome: Outcome) {
  const relative = relativeToBtc(episode.ret104w, episode.btcRet104w);
  const vsBtc =
    relative === null || outcome === "fell"
      ? ""
      : `, ${signedPct(relative)} vs BTC`;
  return `${episode.name} (${episode.symbol}), from ${longDate(episode.week)}: ${signedPct(episode.ret104w)} over 2 years${vsBtc}. ${TEXT[outcome]}`;
}

/**
 * One dot per past episode. Filled accent = beat BTC over 2 years, open ring =
 * lagged, crossed = fell out. Fill and shape carry the meaning, not color alone.
 * Hover or tap a dot for the episode; the five plotted twins wear an ink ring.
 */
export function EpisodeDots({
  episodes,
  twinKeys = [],
  max = 420,
}: {
  episodes: EpisodeRow[];
  twinKeys?: string[];
  max?: number;
}) {
  const sorted = [...episodes].sort(
    (a, b) =>
      ORDER[outcomeOf(a)] - ORDER[outcomeOf(b)] || a.week.localeCompare(b.week),
  );
  const n = sorted.length;
  const cols = n <= 100 ? 17 : n <= 240 ? 24 : 30;
  const size = 16;
  const gap = 6;
  const step = size + gap;
  const rows = Math.ceil(n / cols);
  const width = cols * step - gap;
  const height = rows * step - gap;
  const present = new Set(sorted.map(outcomeOf));
  const k = sorted.filter((e) => e.beatBtc104w).length;
  const twins = new Set(twinKeys);
  const time = dotTimeline(n, k);
  const rest = n - k;
  const hasTwin = sorted.some((e) => twins.has(episodeKey(e)));

  return (
    <figure className="m-0">
      <DotsHover>
        <svg
          viewBox={`-3 -3 ${width + 6} ${height + 6}`}
          width="100%"
          style={{ maxWidth: Math.min(max, width + 6) }}
          role="img"
          aria-label={`${n} past episodes: ${k} beat BTC over 2 years, ${n - k} did not.`}
          className="block"
        >
          {sorted.map((episode, i) => {
            const cx = (i % cols) * step + size / 2;
            const cy = Math.floor(i / cols) * step + size / 2;
            const outcome = outcomeOf(episode);
            const key = episodeKey(episode);
            const twin = twins.has(key);
            // Beat dots sit first in the grid but land last.
            const delay =
              outcome === "beat"
                ? time.beatStart + (i * time.beatWindow) / Math.max(1, k)
                : time.start + ((i - k) * time.restWindow) / Math.max(1, rest);
            return (
              <g
                key={key}
                data-tip={tipFor(episode, outcome)}
                data-twin={twin ? key : undefined}
                className={twin ? "dot-in cursor-pointer" : "dot-in"}
                style={{ "--d": `${Math.round(delay)}ms` } as CSSProperties}
              >
                <rect
                  x={cx - step / 2}
                  y={cy - step / 2}
                  width={step}
                  height={step}
                  fill="transparent"
                />
                {outcome === "beat" ? (
                  <circle cx={cx} cy={cy} r={size / 2} fill="var(--accent)" />
                ) : (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={size / 2 - 1}
                    fill="none"
                    stroke="var(--mark-muted)"
                    strokeWidth={1.5}
                  />
                )}
                {outcome === "fell" && (
                  <path
                    d={`M${cx - 4} ${cy - 4}L${cx + 4} ${cy + 4}M${cx + 4} ${cy - 4}L${cx - 4} ${cy + 4}`}
                    stroke="var(--mark-muted)"
                    strokeWidth={1.5}
                  />
                )}
                {twin && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={size / 2 + 2.5}
                    fill="none"
                    stroke="var(--ink)"
                    strokeWidth={1.25}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </DotsHover>
      <figcaption className="text-muted mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="5" fill="var(--accent)" />
          </svg>
          beat BTC
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle
              cx="5"
              cy="5"
              r="4.25"
              fill="none"
              stroke="var(--mark-muted)"
              strokeWidth="1.5"
            />
          </svg>
          lagged BTC
        </span>
        {present.has("fell") && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden>
              <circle
                cx="5"
                cy="5"
                r="4.25"
                fill="none"
                stroke="var(--mark-muted)"
                strokeWidth="1.5"
              />
              <path
                d="M3 3L7 7M7 3L3 7"
                stroke="var(--mark-muted)"
                strokeWidth="1.2"
              />
            </svg>
            fell out, counted as a total loss
          </span>
        )}
        {hasTwin && (
          <span className="inline-flex items-center gap-1.5">
            <svg width="14" height="14" aria-hidden>
              <circle
                cx="7"
                cy="7"
                r="6"
                fill="none"
                stroke="var(--ink)"
                strokeWidth="1.25"
              />
            </svg>
            closest twin, tap for its line
          </span>
        )}
      </figcaption>
    </figure>
  );
}
