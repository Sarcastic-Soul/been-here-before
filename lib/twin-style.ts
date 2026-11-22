/**
 * How each twin line is drawn. Color carries the outcome (rust = beat BTC over
 * 2 years, a grey = did not); the dash pattern and the end label carry which
 * twin it is, so the five lines can be told apart without color.
 * Plain module so server pages (the twin list) and the client chart share it.
 */
export interface LineStyle {
  stroke: string;
  dash: string | undefined;
  width: number;
}

const DASHES = [undefined, "8 4", "1.5 4", "12 4 2 4", "4 3"];
// Two greys, never as bright as the ink line used for the coin itself.
const GREYS = ["var(--mark-muted)", "var(--muted)"];

export function twinLineStyle(
  index: number,
  twin: { beat: boolean; own?: boolean },
): LineStyle {
  if (twin.own) return { stroke: "var(--ink)", dash: undefined, width: 3 };
  return {
    stroke: twin.beat ? "var(--accent)" : GREYS[index % GREYS.length],
    dash: DASHES[index % DASHES.length],
    width: 2,
  };
}

/** Window event that asks a twin chart to pick out one line by its key. */
export const TWIN_FOCUS_EVENT = "bhb:twin-focus";
