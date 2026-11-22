"use client";

import { useEffect, useId, useState } from "react";

import { monthYear, signedPct } from "@/lib/format";
import { TWIN_FOCUS_EVENT, twinLineStyle } from "@/lib/twin-style";

import { LineSwatch } from "./line-swatch";
import { useWidth } from "./use-width";

export interface TwinSeries {
  key: string;
  name: string;
  symbol: string;
  start: string;
  beat: boolean;
  path: { t: number; vsBtc: number }[];
  /** The coin being looked at (time machine): drawn in ink, on top. */
  own?: boolean;
}

const HORIZON = 104;
const M = { top: 12, right: 58, bottom: 26, left: 40 };

function vsBtcText(index: number) {
  return `${signedPct(index / 100 - 1)} vs BTC`;
}

/**
 * Price of each twin divided by BTC, 100 at the episode start, log scale.
 * Above 100 the coin was ahead of simply holding BTC. Rust = beat BTC over 2
 * years; each twin has its own dash so the lines can be told apart. Hover or
 * press a legend entry (or click a ringed dot in the grid) to pick one out.
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
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const focusKey = hoverKey ?? pinned;
  const clipId = `wipe-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

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

  const series = twins
    .map((twin, index) => {
      const points = twin.path.filter((p) => p.vsBtc > 0);
      return {
        ...twin,
        points,
        last: points[points.length - 1],
        style: twinLineStyle(index, twin),
      };
    })
    // The coin itself last, so it draws on top of its twins.
    .sort((a, b) => Number(a.own ?? false) - Number(b.own ?? false));
  const own = series.find((s) => s.own);
  const plotted = series.filter((s) => !s.own);
  const beatCount = plotted.filter((s) => s.beat).length;
  const keys = series.map((s) => s.key).join("|");

  // A ringed dot in the grid asks for its twin: pin that line and bring the
  // chart into view.
  useEffect(() => {
    function onFocus(event: Event) {
      const key = (event as CustomEvent<string>).detail;
      if (!keys.split("|").includes(key)) return;
      setPinned(key);
      const still = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      ref.current?.scrollIntoView({
        block: "center",
        behavior: still ? "auto" : "smooth",
      });
    }
    window.addEventListener(TWIN_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(TWIN_FOCUS_EVENT, onFocus);
  }, [keys, ref]);

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
      <div className="mb-2 flex flex-wrap items-center gap-x-1 gap-y-0 text-xs">
        {plotted.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={pinned === s.key}
            title={`${s.name}, from ${monthYear(s.start)}: ${s.beat ? "beat" : "lagged"} BTC over 2 years`}
            onPointerEnter={() => setHoverKey(s.key)}
            onPointerLeave={() => setHoverKey(null)}
            onFocus={() => setHoverKey(s.key)}
            onBlur={() => setHoverKey(null)}
            onClick={() => setPinned((key) => (key === s.key ? null : s.key))}
            className={`inline-flex min-h-11 items-center gap-1.5 border-b-2 px-1.5 transition-colors duration-150 sm:min-h-9 ${
              pinned === s.key
                ? "border-ink text-ink"
                : "text-ink-body hover:border-rule border-transparent"
            }`}
          >
            <LineSwatch style={s.style} />
            <span className="num font-medium">{s.symbol}</span>
            <span className="text-muted">{monthYear(s.start)}</span>
          </button>
        ))}
        {own && (
          <span className="text-ink inline-flex min-h-9 items-center gap-1.5 px-1.5 font-medium">
            <LineSwatch style={own.style} />
            what {own.symbol} really did
          </span>
        )}
      </div>
      <p className="text-muted mb-3 text-xs">
        {plotted.length === 0
          ? ""
          : beatCount === 0
            ? `None of ${plotted.length === 5 ? "the five" : "these"} beat BTC over 2 years, so every line is grey.`
            : beatCount === plotted.length
              ? "Every one of these beat BTC over 2 years, so every line is rust."
              : "Rust lines beat BTC over 2 years; grey lines did not."}{" "}
        The solid line at 100 is level with BTC.
      </p>
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
          <defs>
            <clipPath id={clipId}>
              <rect
                className="wipe"
                x={M.left - 4}
                y={0}
                width={plotW + 12}
                height={height}
              />
            </clipPath>
          </defs>
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

          <g clipPath={`url(#${clipId})`}>
            {series.map((s) => {
              const dim = focusKey !== null && focusKey !== s.key;
              return (
                <polyline
                  key={s.key}
                  points={s.points
                    .map((p) => `${x(p.t).toFixed(1)},${y(p.vsBtc).toFixed(1)}`)
                    .join(" ")}
                  fill="none"
                  stroke={s.style.stroke}
                  strokeDasharray={s.style.dash}
                  strokeWidth={focusKey === s.key && !s.own ? 3 : s.style.width}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={dim ? 0.2 : 1}
                  style={{ transition: "opacity 150ms ease-out" }}
                />
              );
            })}
          </g>

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
              fontWeight={focusKey === label.key ? 600 : 400}
              className="num fade-late cursor-default"
              onPointerEnter={() => setHoverKey(label.key)}
              onPointerLeave={() => setHoverKey(null)}
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
                  fill={s.style.stroke}
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
                  <LineSwatch style={s.style} width={16} />
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
