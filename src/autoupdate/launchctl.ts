/**
 * The `launchctl` subprocess seam (§10.2, §17.1).
 *
 * Everything that talks to launchd goes through `runLaunchctl`, so tests
 * can install a stub with `setLaunchctlRunner` and restore the real
 * runner with `resetLaunchctlRunner` — macOS CI has no user session
 * launchd to talk to. Job management built on top lives in `./launchd.ts`.
 */

/**
 * Test seam for `launchctl`. Replace with a stub in tests; the default
 * invokes the real binary on macOS. Where `launchctl` isn't available,
 * `Bun.spawnSync` throws `ENOENT` and the runner reports failure with
 * that message as stderr. Note what that means for `probeAutoupdate`:
 * a missing binary is "couldn't ask", not "the agent is not loaded" —
 * the platform selector already answers `not-loaded` for platforms
 * without a scheduler, so this path only fires when launchd *should*
 * be reachable and isn't.
 *
 * The runner returns stderr as well as the status so a failed repair
 * can name the platform error (§11.2). A stub may return a bare
 * boolean; `runLaunchctl` normalizes both shapes — a bare `false`
 * carries no diagnostic and so reads as a definitive "not loaded".
 */
export interface LaunchctlResult {
  readonly ok: boolean;
  readonly stderr: string;
}
export type LaunchctlRunner = (args: string[]) => boolean | LaunchctlResult;

/** launchctl's diagnostics are short; cap them so an error stays readable. */
const MAX_STDERR = 500;

function defaultRunner(args: string[]): LaunchctlResult {
  try {
    const proc = Bun.spawnSync({
      cmd: ["launchctl", ...args],
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      ok: (proc.exitCode ?? -1) === 0,
      stderr: (proc.stderr?.toString() ?? "").trim().slice(0, MAX_STDERR),
    };
  } catch (err) {
    // `Bun.spawnSync` throws when the process boundary itself fails —
    // `launchctl` missing, no user session. Keeping the text matters:
    // it is the only diagnostic a failed repair can show, and an empty
    // stderr here would also read as a definitive "not loaded" to
    // `probeAutoupdate`, which is exactly the ambiguity it exists to
    // avoid. Matches the systemd runner's behaviour.
    return {
      ok: false,
      stderr: (err instanceof Error ? err.message : String(err)).slice(0, MAX_STDERR),
    };
  }
}
let launchctlRunner: LaunchctlRunner = defaultRunner;

export function setLaunchctlRunner(next: LaunchctlRunner): LaunchctlRunner {
  const prev = launchctlRunner;
  launchctlRunner = next;
  return prev;
}

export function resetLaunchctlRunner(): void {
  launchctlRunner = defaultRunner;
}

/**
 * Normalize the seam's two accepted shapes into a result. A stub that
 * returns a bare boolean carries no diagnostic, which is why the
 * platform-error tests drive the systemd seam.
 */
export function runLaunchctl(args: string[]): LaunchctlResult {
  const r = launchctlRunner(args);
  return typeof r === "boolean" ? { ok: r, stderr: "" } : r;
}
