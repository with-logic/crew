/**
 * Background spawner for the post-command version check (§10.4).
 *
 * When the main process decides the version-check record is stale, it
 * launches a detached copy of itself (`crew self-update --check
 * --background`) that queries the release feed and writes
 * `version-check.json`. The main process does not wait for the child
 * and is never blocked by network latency.
 *
 * Behind a seam so tests can assert a spawn would happen without
 * actually spawning anything.
 */

/** How the main process kicks off a background version check. */
export type BackgroundSpawner = (argv: string[], home: string) => void;

let spawner: BackgroundSpawner = defaultSpawner;

export function setBackgroundSpawner(next: BackgroundSpawner): BackgroundSpawner {
  const prev = spawner;
  spawner = next;
  return prev;
}

export function resetBackgroundSpawner(): void {
  spawner = defaultSpawner;
}

/** Kick off the detached child. The main process does not wait. */
export function spawnBackgroundCheck(home: string): void {
  spawner(["self-update", "--check", "--background"], home);
}

function defaultSpawner(argv: string[], home: string): void {
  // `process.execPath` is the running crew binary (or `bun` in dev
  // mode). Either way, re-invoking it with the same argv is the right
  // thing: the background child runs through the usual CLI dispatch
  // and exits when the write completes.
  try {
    const child = Bun.spawn({
      cmd: [process.execPath, ...argv],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: { ...process.env, CREW_HOME: home },
    });
    // Detach: let the child outlive this process. Bun's `unref` makes
    // the handle eligible for GC so the event loop can exit even if
    // the child is still running.
    child.unref();
  } catch {
    // A spawn failure here is non-fatal. The nag will just be stale
    // for another 24h; a later invocation retries.
  }
}
