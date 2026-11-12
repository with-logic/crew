/**
 * Numeric settings read from the environment, such as the timeouts in §14
 * and §17.1: one rule for what counts as a usable value.
 */

/** The number in environment variable `name` when it is finite and positive, else `fallback`. */
export function positiveEnvNumber(name: string, fallback: number): number {
  const given = Number(process.env[name]);
  return Number.isFinite(given) && given > 0 ? given : fallback;
}
