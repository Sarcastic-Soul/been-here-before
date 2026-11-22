import type { LineStyle } from "@/lib/twin-style";

/** A short sample of a chart line, for legends and lists. */
export function LineSwatch({
  style,
  width = 22,
}: {
  style: LineStyle;
  width?: number;
}) {
  return (
    <svg width={width} height="8" aria-hidden className="shrink-0">
      <line
        x1="1"
        x2={width - 1}
        y1="4"
        y2="4"
        stroke={style.stroke}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
        strokeLinecap="round"
      />
    </svg>
  );
}
