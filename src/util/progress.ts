/**
 * Progress sink for `--verbose` (§5.2).
 *
 * Commands are pure functions that never write to stdout/stderr, so
 * low-level modules (git exec, store staging, agent install) can't
 * print progress themselves. Instead they call `progress(line)`, which
 * forwards to whatever sink the CLI layer installed for this run. With
 * no sink installed (the default, and every non-verbose run) the call
 * is a no-op.
 *
 * The CLI installs a sink only when `--verbose` is set and clears it
 * when the command finishes — success or error — so a sink never
 * leaks into a later `runCli` call in the same process (tests).
 */

export type ProgressSink = (line: string) => void;

let sink: ProgressSink | null = null;

/** Install (or clear, with `null`) the sink for the current run. */
export function setProgressSink(next: ProgressSink | null): void {
  sink = next;
}

/** Emit one progress line to the active sink, if any. */
export function progress(line: string): void {
  if (sink) sink(line);
}
