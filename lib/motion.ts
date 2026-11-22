/**
 * When the entrance runs, in ms. The grey dots fill first, then a short pause,
 * then the dots that beat BTC land last, so the eye ends on them. The big
 * count above the grid counts up over the same last window.
 */
export function dotTimeline(n: number, k: number) {
  const start = 250;
  const rest = n - k;
  const restWindow = rest > 0 ? Math.min(700, rest * 14) : 0;
  const beatStart = start + restWindow + (rest > 0 ? 160 : 0);
  const beatWindow = k > 0 ? Math.min(520, k * 70) : 0;
  return { start, restWindow, beatStart, beatWindow };
}
