/**
 * Time helpers. Kept in one place so tests can stub time trivially via the
 * `CREW_NOW` environment variable — otherwise every timestamp in every
 * marker file depends on the wall clock.
 */

/** Current time as an RFC 3339 UTC string, with millisecond precision. */
export function nowIso(): string {
  const override = process.env["CREW_NOW"];
  return override && override.length > 0 ? override : new Date().toISOString();
}
