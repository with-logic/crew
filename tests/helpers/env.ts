/**
 * Redirect crew's HOME and set a stable time, and return helpers to pass
 * to `runCli` so tests never need to touch process.env or the real home
 * directory.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OutputStreams } from "../../src/cli/output.ts";
import type { TargetAdapter } from "../../src/targets/adapter.ts";
import { ALL_ADAPTERS } from "../../src/targets/registry.ts";

/** Capture stdout/stderr into a buffer. */
export function captureStreams(): { streams: OutputStreams; stdout(): string; stderr(): string } {
  let stdout = "";
  let stderr = "";
  return {
    streams: {
      stdout: (s: string) => {
        stdout += s;
      },
      stderr: (s: string) => {
        stderr += s;
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

/** Make a fresh crew home directory. */
export function makeCrewHome(): string {
  return mkdtempSync(join(tmpdir(), "crew-home-"));
}

type AdapterMut = {
  userPath: TargetAdapter["userPath"];
  projectPath: TargetAdapter["projectPath"];
  detect: TargetAdapter["detect"];
};

/**
 * Preload-captured originals for every adapter. Tests that need to
 * exercise an adapter's real detection/path logic can call
 * `withOriginalAdapter(name, cb)` to swap the real impl in for the
 * duration of the callback. Populated by `neutralizeAdaptersExcept`
 * on first call.
 */
const ADAPTER_ORIGINALS = new Map<string, AdapterMut>();

/**
 * Force every adapter NOT in the `keep` set to be undetected and point
 * at an inert tmp dir, so tests aren't influenced by whatever
 * development agents happen to be installed on the dev machine. The
 * real implementations are captured in `ADAPTER_ORIGINALS` so
 * `withOriginalAdapter` can restore them for targeted tests.
 *
 * Called once by `preload.ts`. There's intentionally no restore
 * function — the neutralization is global for the run.
 */
export function neutralizeAdaptersExcept(keep: readonly string[]): void {
  const keepSet = new Set(keep);
  const inert = mkdtempSync(join(tmpdir(), "crew-inert-adapters-"));
  for (const a of ALL_ADAPTERS) {
    if (keepSet.has(a.name)) continue;
    ADAPTER_ORIGINALS.set(a.name, {
      userPath: a.userPath,
      projectPath: a.projectPath,
      detect: a.detect,
    });
    (a as AdapterMut).userPath = () => join(inert, a.name);
    (a as AdapterMut).projectPath = () => join(inert, a.name);
    (a as AdapterMut).detect = () => false;
  }
}

/**
 * Run `cb` with the named adapter temporarily restored to its real
 * implementation (captured before the preload neutralized it). Used
 * by unit tests that need to exercise an adapter's actual
 * detect/userPath/projectPath code against a controlled environment.
 */
export function withOriginalAdapter<T>(adapterName: string, cb: (a: TargetAdapter) => T): T {
  const adapter = ALL_ADAPTERS.find((a) => a.name === adapterName);
  if (!adapter) throw new Error(`unknown adapter ${adapterName}`);
  const orig = ADAPTER_ORIGINALS.get(adapterName);
  if (!orig) return cb(adapter);
  const before: AdapterMut = {
    userPath: adapter.userPath,
    projectPath: adapter.projectPath,
    detect: adapter.detect,
  };
  (adapter as AdapterMut).userPath = orig.userPath;
  (adapter as AdapterMut).projectPath = orig.projectPath;
  (adapter as AdapterMut).detect = orig.detect;
  try {
    return cb(adapter);
  } finally {
    (adapter as AdapterMut).userPath = before.userPath;
    (adapter as AdapterMut).projectPath = before.projectPath;
    (adapter as AdapterMut).detect = before.detect;
  }
}
