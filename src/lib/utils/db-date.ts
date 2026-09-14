/**
 * Parse a timestamp as it comes out of the database.
 *
 * The columns are `timestamp without time zone` holding UTC, and drizzle hands
 * them out as bare strings like "2026-09-14 10:51:24.604". `new Date()` reads a
 * string without an offset as *local* time, so every "vor x Min." and every
 * date in the app was off by the viewer's UTC offset — two hours in German
 * summer time, which is why a change made a minute ago said "vor 2 Std.".
 */
export function parseDbTimestamp(value: string | Date): Date {
  if (value instanceof Date) {
    return value;
  }
  const hasOffset = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(value.trim());
  return new Date(hasOffset ? value : `${value.trim().replace(" ", "T")}Z`);
}

/** Dates shown to people are German time, including when rendered on a UTC server. */
export const DISPLAY_TIME_ZONE = "Europe/Berlin";
