const DAY_MS = 86_400_000;

/** Parse YYYY-MM-DD as a UTC date. */
export function parseDay(day: string): Date {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Bad date: ${day}`);
  return date;
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The last Sunday on or before `date` (UTC). */
export function sundayOnOrBefore(date: Date): Date {
  return new Date(date.getTime() - date.getUTCDay() * DAY_MS);
}

/** Every Sunday from `first` to `last`, both inclusive, as YYYY-MM-DD. */
export function sundaysBetween(first: string, last: string): string[] {
  const start = sundayOnOrBefore(parseDay(first));
  const end = parseDay(last);
  const days: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 7 * DAY_MS) {
    days.push(formatDay(new Date(t)));
  }
  return days;
}
