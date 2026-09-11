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
 * The CLI installs a sink for every invocation — the stderr writer for
 * a `--verbose` run, an explicit `null` otherwise — and restores the
 * previous one when the command finishes, success or error. Save and
 * restore (rather than install-then-clear) is what makes nesting safe:
 * a `runCli` call made from inside another one, via a `prompt` or
 * stream callback, neither writes into its caller's stderr nor wipes
 * the caller's sink on the way out.
 */

export type ProgressSink = (line: string) => void;

let sink: ProgressSink | null = null;

/**
 * Install a sink (or `null` to silence progress) and return the one it
 * replaced, so the caller can restore it in a `finally`.
 */
export function setProgressSink(next: ProgressSink | null): ProgressSink | null {
  const previous = sink;
  sink = next;
  return previous;
}

/** Emit one progress line to the active sink, if any. */
export function progress(line: string): void {
  if (sink) sink(line);
}
