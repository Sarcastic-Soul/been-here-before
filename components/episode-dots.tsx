import { longDate, signedPct } from "@/lib/format";
import type { EpisodeRow } from "@/lib/verdict/types";

type Outcome = "beat" | "lagged" | "fell";

function outcomeOf(episode: EpisodeRow): Outcome {
  if (episode.beatBtc104w) return "beat";
  return episode.fellOut104w ? "fell" : "lagged";
}

const ORDER: Record<Outcome, number> = { beat: 0, lagged: 1, fell: 2 };
const TEXT: Record<Outcome, string> = {
  beat: "beat BTC",
  lagged: "lagged BTC",
  fell: "fell out of the top 5,000",
};

/**
 * One dot per past episode. Filled accent = beat BTC over 2 years, open ring =
 * lagged, crossed = fell out. Fill and shape carry the meaning, not color alone.
 */
export function EpisodeDots({
  episodes,
  max = 420,
}: {
  episodes: EpisodeRow[];
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

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ maxWidth: Math.min(max, width) }}
        role="img"
        aria-label={`${n} past episodes: ${k} beat BTC over 2 years, ${n - k} did not.`}
      >
        {sorted.map((episode, i) => {
          const cx = (i % cols) * step + size / 2;
          const cy = Math.floor(i / cols) * step + size / 2;
          const outcome = outcomeOf(episode);
          return (
            <g key={`${episode.lineageId}-${episode.week}`}>
              <title>
                {`${episode.name} (${episode.symbol}), from ${longDate(episode.week)}: ${signedPct(episode.ret104w)} over 2 years, ${TEXT[outcome]}`}
              </title>
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
            </g>
          );
        })}
      </svg>
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
      </figcaption>
    </figure>
  );
}
