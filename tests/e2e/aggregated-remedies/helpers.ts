/** Real-source and byte-preservation helpers for explicit aggregate hints (§10.1, §13, §16.6). */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { paths } from "../../../src/core/paths.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams } from "../../helpers/env.ts";
import { snapshot } from "../../helpers/snapshot.ts";

export const FILE_HINT =
  "Check that the source file exists and that you can read it and access its parent directories.";
export const DIRECTORY_HINT =
  "Check that the source directory can be listed and searched, and that you can access its parent directories.";

export function invoke(home: string, args: string[], cwd?: string) {
  const capture = captureStreams();
  const code = runCli(args, {
    home,
    streams: capture.streams,
    ...(cwd === undefined ? {} : { cwd }),
  });
  return { code, stdout: capture.stdout(), stderr: capture.stderr() };
}

export function sourceFailure(read: () => unknown): unknown {
  let failure: unknown;
  try {
    read();
  } catch (error) {
    failure = error;
  }
  return failure;
}

export function installed(home: string, target: string, name: string) {
  return {
    entries: readState(home).installations.filter((entry) => entry.name === name),
    files: snapshot(join(target, name)),
  };
}

export function immutable(home: string, ...targets: string[]) {
  return {
    state: readFileSync(paths(home).stateFile),
    store: snapshot(paths(home).storeDir),
    installs: targets.map((target) => {
      const files = snapshot(target);
      // §14: lease ownership timestamps may change without changing installed skill bytes.
      delete files[".crew-target.lock.owner"];
      return files;
    }),
  };
}

export function removeOfflineCore(home: string): void {
  const config = readConfig(home);
  writeConfig({ ...config, taps: config.taps.filter((tap) => tap.name !== "core") }, home);
}
