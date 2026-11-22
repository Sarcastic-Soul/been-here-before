import {
  clearestFeature,
  MIN_WINNERS,
  type FeatureKey,
  type WinnerFeature,
  type WinnerSplit,
} from "@/lib/engine/winners";
import { count, drawdownPct, pct, years } from "@/lib/format";
import type { CoinState } from "@/lib/verdict/types";

/** Below this many winners the medians get a small-sample warning. */
const FEW_WINNERS = 15;

/** Show the panel only when both sides have enough episodes to compare. */
export function hasWinnerSplit(
  split: WinnerSplit | undefined,
): split is WinnerSplit {
  return (
    split !== undefined &&
    split.winners >= MIN_WINNERS &&
    split.rest >= MIN_WINNERS
  );
}

function format(feature: WinnerFeature, value: number | null | undefined) {
  if (value === null || value === undefined) return "n/a";
  switch (feature.unit) {
    case "pct":
      if (feature.key === "drawdown") return drawdownPct(value);
      return pct(value, value > 0 && value < 0.1 ? 1 : 0);
    case "weeks":
      return value < 104 ? `${Math.round(value)} weeks` : years(value);
    case "rank":
      return `#${Math.round(value)}`;
  }
}

function currentValue(key: FeatureKey, state: CoinState) {
  switch (key) {
    case "drawdown":
      return state.drawdown;
    case "weeksSincePeak":
      return state.weeksSincePeak;
    case "ageWeeks":
      return state.ageWeeks;
    case "rankAdj":
      return state.rankAdj;
    case "turnover":
      return null;
  }
}

/** Where the share sits on 0–100%, with a tick at the no-difference middle. */
function ShareMark({ share }: { share: number }) {
  const width = 72;
  const x = 4 + share * (width - 8);
  return (
    <svg width={width} height={14} aria-hidden className="block">
      <line
        x1={4}
        x2={width - 4}
        y1={7}
        y2={7}
        stroke="var(--grid)"
        strokeWidth={2}
      />
      <line
        x1={width / 2}
        x2={width / 2}
        y1={2}
        y2={12}
        stroke="var(--rule)"
        strokeWidth={1}
      />
      <circle
        cx={x}
        cy={7}
        r={4}
        fill="var(--accent)"
        stroke="var(--paper)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

/**
 * Episodes that beat BTC against the rest, on facts known in their start week.
 * Descriptive only: none of it feeds the verdict.
 */
export function WinnersTable({
  split,
  state,
  stateLabel = "This coin now",
}: {
  split: WinnerSplit;
  state: CoinState;
  stateLabel?: string;
}) {
  const clearest = clearestFeature(split);
  return (
    <div>
      <p className="text-ink-body mb-5 max-w-[60ch] text-[16px]">
        {clearest && clearest.higherShare !== null ? (
          <>
            The clearest split: the winners{" "}
            <b className="text-ink font-medium">
              {clearest.higherShare > 0.5 ? clearest.more : clearest.less}
            </b>
            . That held in{" "}
            {pct(Math.max(clearest.higherShare, 1 - clearest.higherShare))} of
            all pairs of a winner and another episode.
          </>
        ) : (
          <>
            No start-week fact split the winners from the rest clearly. Inside
            this spot, which coins went on to beat BTC looks close to luck.
          </>
        )}
        {split.winners < FEW_WINNERS && (
          <>
            {" "}
            Only {split.winners} episodes beat BTC, so read the medians as a
            hint.
          </>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <caption className="sr-only">
            Median start-week facts for episodes that beat BTC over 2 years and
            for the rest
          </caption>
          <thead>
            <tr className="text-muted text-left text-xs">
              <th scope="col" className="border-ink border-b py-2 font-medium">
                At the start
              </th>
              <th
                scope="col"
                className="border-ink border-b py-2 pl-4 text-right font-medium whitespace-nowrap"
              >
                Beat BTC ({count(split.winners)})
              </th>
              <th
                scope="col"
                className="border-ink border-b py-2 pl-4 text-right font-medium whitespace-nowrap"
              >
                The rest ({count(split.rest)})
              </th>
              <th
                scope="col"
                className="border-ink border-b py-2 pl-4 font-medium whitespace-nowrap sm:pl-6"
              >
                Winner higher
              </th>
              <th
                scope="col"
                className="border-ink border-b py-2 pl-4 text-right font-medium whitespace-nowrap"
              >
                {stateLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {split.features.map((feature) => (
              <tr key={feature.key}>
                <th
                  scope="row"
                  className="border-rule border-b py-2.5 text-left font-normal"
                >
                  {feature.label}
                </th>
                <td className="num border-rule border-b py-2.5 pl-4 text-right whitespace-nowrap">
                  {format(feature, feature.winners)}
                </td>
                <td className="num border-rule border-b py-2.5 pl-4 text-right whitespace-nowrap">
                  {format(feature, feature.rest)}
                </td>
                <td className="border-rule border-b py-2.5 pl-4 sm:pl-6">
                  {feature.higherShare === null ? (
                    <span className="text-muted">n/a</span>
                  ) : (
                    <span className="flex items-center gap-3">
                      <span className="hidden sm:block">
                        <ShareMark share={feature.higherShare} />
                      </span>
                      <span className="num">{pct(feature.higherShare)}</span>
                    </span>
                  )}
                </td>
                <td className="num border-rule text-muted border-b py-2.5 pl-4 text-right whitespace-nowrap">
                  {format(feature, currentValue(feature.key, state))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-muted mt-4 max-w-[68ch] text-[13px]">
        Medians of each group. &ldquo;Winner higher&rdquo; compares every winner
        with every other episode and counts how often the winner had the bigger
        number: 50% means no difference. All of these coins were already in the
        same spot, so the gaps are small by design. Small groups swing a lot,
        and nothing here feeds the verdict.
      </p>
    </div>
  );
}
