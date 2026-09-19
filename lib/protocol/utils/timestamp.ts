/**
 * Return the current time as an ISO 8601 string.
 *
 * Accepts an optional Date for deterministic testing without
 * global Date mocks.
 *
 * @param date - Override the current time (default: new Date())
 * @returns ISO 8601 timestamp string (e.g., "2026-04-02T16:30:00.000Z")
 *
 * @example
 * now()                                    // "2026-04-02T16:30:00.000Z"
 * now(new Date('2026-01-01T00:00:00.000Z')) // "2026-01-01T00:00:00.000Z"
 */
export function now(date: Date = new Date()): string {
  return date.toISOString();
}
