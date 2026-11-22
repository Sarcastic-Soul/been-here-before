"use client";

import { useState } from "react";

import { signedPct } from "@/lib/format";

import { useWidth } from "./use-width";

export interface TwinSeries {
  key: string;
  name: string;
  symbol: string;
  start: string;
  beat: boolean;
  path: { t: number; vsBtc: number }[];
}

const HORIZON = 104;
const M = { top: 12, right: 58, bottom: 26, left: 40 };

function vsBtcText(index: number) {
  return `${signedPct(index / 100 - 1)} vs BTC`;
}

/**
 * Price of each twin divided by BTC, 100 at the episode start, log scale.
 * Above 100 the coin was ahead of simply holding BTC. Accent = ended ahead.
 */
export function TwinChart({
  twins,
  height = 280,
}: {
  twins: TwinSeries[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const values = twins
    .flatMap((twin) => twin.path.map((p) => p.vsBtc))
    .filter((v) => v > 0);
  const lo = Math.floor(Math.log10(Math.max(0.1, Math.min(10, ...values))));
  const hi = Math.ceil(Math.log10(Math.max(200, ...values)));
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => 10 ** (lo + i));

  const plotW = Math.max(120, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const x = (t: number) => M.left + (plotW * t) / HORIZON;
  const y = (v: number) => {
    const clamped = Math.min(10 ** hi, Math.max(10 ** lo, v));
    return M.top + plotH * (1 - (Math.log10(clamped) - lo) / (hi - lo));
  };

  const series = twins.map((twin) => {
    const points = twin.path.filter((p) => p.vsBtc > 0);
    return { ...twin, points, last: points[points.length - 1] };
  });

  // End labels: sort by end height and push apart so they never overlap.
  const labels = series
    .filter((s) => s.last)
    .map((s) => ({
      key: s.key,
      symbol: s.symbol,
      y: y(s.last.vsBtc),
      x: x(s.last.t),
    }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i].y - labels[i - 1].y < 13) labels[i].y = labels[i - 1].y + 13;
  }

  const atT = (t: number) =>
    series
      .map((s) => ({
        s,
        p: s.points.reduce(
          (best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best),
          s.points[0],
        ),
      }))
      .filter((row) => row.p && Math.abs(row.p.t - t) <= 2)
      .sort((a, b) => b.p.vsBtc - a.p.vsBtc);

  function moveTo(clientX: number, target: SVGRectElement) {
    const box = target.getBoundingClientRect();
    const t = Math.round(((clientX - box.left) / box.width) * HORIZON);
    setHoverT(Math.max(0, Math.min(HORIZON, t)));
  }

  const rows = hoverT === null ? [] : atT(hoverT);
  const tooltipLeft = hoverT === null ? 0 : x(hoverT);
  const flip = tooltipLeft > width * 0.6;

  return (
    <figure className="m-0">
      <div className="text-muted mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <line
              x1="0"
              x2="16"
              y1="4"
              y2="4"
              stroke="var(--accent)"
              strokeWidth="2"
            />
          </svg>
          ended ahead of BTC
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <line
              x1="0"
              x2="16"
              y1="4"
              y2="4"
              stroke="var(--mark-muted)"
              strokeWidth="2"
            />
          </svg>
          ended behind BTC
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden>
            <line
              x1="0"
              x2="16"
              y1="4"
              y2="4"
              stroke="var(--ink)"
              strokeWidth="1"
            />
          </svg>
          100 = level with BTC
        </span>
      </div>
      <div ref={ref} className="relative [contain:inline-size]">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Price versus BTC over 104 weeks for ${twins.length} closest past twins: ${series
            .map(
              (s) =>
                `${s.name} ${s.last ? vsBtcText(s.last.vsBtc) : "no data"}`,
            )
            .join("; ")}.`}
          className="block overflow-visible"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 100 ? "var(--ink)" : "var(--grid)"}
                strokeWidth={1}
                strokeDasharray={tick === 100 ? undefined : "3 3"}
              />
              <text
                x={M.left - 8}
                y={y(tick) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--muted)"
                className="num"
              >
                {tick >= 1 ? tick : tick.toFixed(1)}
              </text>
            </g>
          ))}
          {[0, 26, 52, 78, 104].map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 6}
              textAnchor="middle"
              fontSize={11}
              fill="var(--muted)"
            >
              {t === 0
                ? "start"
                : t === 104
                  ? "2 years"
                  : t === 52
                    ? "1 year"
                    : `${t}w`}
            </text>
          ))}

          {series.map((s) => {
            const dim = focusKey !== null && focusKey !== s.key;
            return (
              <polyline
                key={s.key}
                points={s.points
                  .map((p) => `${x(p.t).toFixed(1)},${y(p.vsBtc).toFixed(1)}`)
                  .join(" ")}
                fill="none"
                stroke={s.beat ? "var(--accent)" : "var(--mark-muted)"}
                strokeWidth={focusKey === s.key ? 2.75 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={dim ? 0.25 : 1}
                style={{ transition: "opacity 150ms ease-out" }}
              />
            );
          })}

          {labels.map((label) => (
            <text
              key={label.key}
              x={M.left + plotW + 6}
              y={label.y + 4}
              fontSize={11}
              fill={
                focusKey === null || focusKey === label.key
                  ? "var(--ink)"
                  : "var(--muted)"
              }
              className="num cursor-default"
              onPointerEnter={() => setFocusKey(label.key)}
              onPointerLeave={() => setFocusKey(null)}
            >
              {label.symbol}
            </text>
          ))}

          {hoverT !== null && (
            <g pointerEvents="none">
              <line
                x1={x(hoverT)}
                x2={x(hoverT)}
                y1={M.top}
                y2={M.top + plotH}
                stroke="var(--ink)"
                strokeWidth={1}
              />
              {rows.map(({ s, p }) => (
                <circle
                  key={s.key}
                  cx={x(p.t)}
                  cy={y(p.vsBtc)}
                  r={4}
                  fill={s.beat ? "var(--accent)" : "var(--mark-muted)"}
                  stroke="var(--paper)"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}

          <rect
            x={M.left}
            y={M.top}
            width={plotW}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            role="slider"
            aria-label="Weeks after the start. Move along the chart with the arrow keys"
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={HORIZON}
            aria-valuenow={hoverT ?? 0}
            aria-valuetext={`Week ${hoverT ?? 0}`}
            onPointerMove={(event) =>
              moveTo(event.clientX, event.currentTarget)
            }
            onPointerDown={(event) =>
              moveTo(event.clientX, event.currentTarget)
            }
            onPointerLeave={() => setHoverT(null)}
            onFocus={() => setHoverT((t) => t ?? 52)}
            onBlur={() => setHoverT(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight")
                setHoverT((t) => Math.min(HORIZON, (t ?? 0) + 4));
              if (event.key === "ArrowLeft")
                setHoverT((t) => Math.max(0, (t ?? 0) - 4));
            }}
            className="focus-visible:outline-offset-0"
          />
        </svg>

        {hoverT !== null && rows.length > 0 && (
          <div
            role="status"
            className="border-ink bg-paper-raised pointer-events-none absolute top-2 z-10 min-w-[190px] border px-3 py-2 text-xs shadow-[0_6px_18px_rgb(0_0_0/0.08)]"
            style={
              flip
                ? { right: width - tooltipLeft + 12 }
                : { left: tooltipLeft + 12 }
            }
          >
            <div className="text-muted mb-1">
              {hoverT === 0 ? "Start" : `Week ${hoverT}`} after entering the
              spot
            </div>
            {rows.map(({ s, p }) => (
              <div
                key={s.key}
                className="flex items-baseline justify-between gap-4 py-0.5"
              >
                <span className="inline-flex items-center gap-1.5">
                  <svg width="8" height="8" aria-hidden>
                    <circle
                      cx="4"
                      cy="4"
                      r="4"
                      fill={s.beat ? "var(--accent)" : "var(--mark-muted)"}
                    />
                  </svg>
                  {s.symbol}
                </span>
                <span className="num">{vsBtcText(p.vsBtc)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
