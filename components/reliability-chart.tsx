"use client";

import { useState } from "react";

import { count, pct } from "@/lib/format";

import { useWidth } from "./use-width";

export interface ReliabilityPoint {
  bucket: string;
  predicted: number;
  realized: number;
  n: number;
}

const M = { top: 14, right: 16, bottom: 40, left: 46 };
/** Buckets smaller than this are drawn hollow: too few coins to read much into. */
const SMALL = 100;

/**
 * Walk-forward reliability: predicted share that beat BTC (x) against what
 * happened (y). On the diagonal = well calibrated; below it = too hopeful.
 */
export function ReliabilityChart({ points }: { points: ReliabilityPoint[] }) {
  const [ref, width] = useWidth<HTMLDivElement>(520);
  const [active, setActive] = useState<string | null>(null);
  const size = Math.min(width, 560);
  const height = Math.round(size * 0.82);
  const max = Math.max(
    0.6,
    ...points.map((p) => Math.max(p.predicted, p.realized)),
  );
  const top = Math.ceil(max * 10) / 10;
  const plotW = size - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const x = (v: number) => M.left + (plotW * v) / top;
  const y = (v: number) => M.top + plotH * (1 - v / top);
  const ticks = Array.from(
    { length: Math.round(top * 10) + 1 },
    (_, i) => i / 10,
  );
  const current = points.find((p) => p.bucket === active);

  return (
    <figure className="m-0">
      <div ref={ref} className="relative [contain:inline-size]">
        <svg
          width={size}
          height={height}
          role="img"
          aria-label={`Predicted versus actual share that beat BTC: ${points
            .map(
              (p) =>
                `predicted ${pct(p.predicted)}, actual ${pct(p.realized)} (${count(p.n)} coin-dates)`,
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
                stroke="var(--grid)"
                strokeDasharray="3 3"
              />
              <text
                x={M.left - 8}
                y={y(tick) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--muted)"
                className="num"
              >
                {pct(tick)}
              </text>
              <text
                x={x(tick)}
                y={M.top + plotH + 18}
                textAnchor="middle"
                fontSize={11}
                fill="var(--muted)"
                className="num"
              >
                {pct(tick)}
              </text>
            </g>
          ))}
          <line
            x1={x(0)}
            y1={y(0)}
            x2={x(top)}
            y2={y(top)}
            stroke="var(--ink)"
            strokeWidth={1}
          />
          <text
            x={x(top) - 4}
            y={y(top) + 16}
            textAnchor="end"
            fontSize={11}
            fill="var(--muted)"
            transform={`rotate(${(-Math.atan(plotH / plotW) * 180) / Math.PI} ${x(top) - 4} ${y(top) + 16})`}
          >
            perfect calibration
          </text>
          <text
            x={M.left + plotW / 2}
            y={height - 4}
            textAnchor="middle"
            fontSize={12}
            fill="var(--ink)"
          >
            Predicted share that beat BTC
          </text>
          <text
            x={12}
            y={M.top + plotH / 2}
            textAnchor="middle"
            fontSize={12}
            fill="var(--ink)"
            transform={`rotate(-90 12 ${M.top + plotH / 2})`}
          >
            Actual share
          </text>

          {points.map((p) => {
            const small = p.n < SMALL;
            const on = active === p.bucket;
            return (
              <g key={p.bucket}>
                <line
                  x1={x(p.predicted)}
                  x2={x(p.predicted)}
                  y1={y(p.predicted)}
                  y2={y(p.realized)}
                  stroke="var(--mark-muted)"
                  strokeWidth={1}
                />
                <circle
                  cx={x(p.predicted)}
                  cy={y(p.realized)}
                  r={on ? 7 : 5.5}
                  fill={small ? "var(--paper)" : "var(--accent)"}
                  stroke={small ? "var(--accent)" : "var(--paper)"}
                  strokeWidth={2}
                />
                <circle
                  cx={x(p.predicted)}
                  cy={y(p.realized)}
                  r={16}
                  fill="transparent"
                  tabIndex={0}
                  role="img"
                  aria-label={`Predicted ${pct(p.predicted)}, actual ${pct(p.realized)}, ${count(p.n)} coin-dates`}
                  onPointerEnter={() => setActive(p.bucket)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(p.bucket)}
                  onBlur={() => setActive(null)}
                  className="cursor-default"
                />
              </g>
            );
          })}
        </svg>
        {current && (
          <div
            role="status"
            className="border-ink bg-paper-raised pointer-events-none absolute z-10 border px-3 py-2 text-xs shadow-[0_6px_18px_rgb(0_0_0/0.08)]"
            style={{
              left: Math.min(x(current.predicted) + 14, size - 190),
              top: Math.max(0, y(current.realized) - 64),
            }}
          >
            <div className="text-muted mb-1">Predicted {current.bucket}</div>
            <div className="num">
              Average prediction {pct(current.predicted, 1)}
            </div>
            <div className="num">
              Actually beat BTC {pct(current.realized, 1)}
            </div>
            <div className="num text-muted">{count(current.n)} coin-dates</div>
          </div>
        )}
      </div>
      <figcaption className="text-muted mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="5" fill="var(--accent)" />
          </svg>
          bucket of predictions
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="10" height="10" aria-hidden>
            <circle
              cx="5"
              cy="5"
              r="4"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
            />
          </svg>
          under {SMALL} coin-dates
        </span>
        <span>Grey stem: gap between promise and outcome</span>
      </figcaption>
    </figure>
  );
}
