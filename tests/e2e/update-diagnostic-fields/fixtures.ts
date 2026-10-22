/** Real CLI capture and byte snapshots for diagnostic-field boundaries (§5.2, §10.1, §13). */

import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { walk } from "../../../src/util/fs.ts";
import { captureStreams } from "../../helpers/env.ts";

/** Keep assertions at the call site, including setup failures. */
export function invoke(home: string, args: readonly string[], cwd?: string) {
  const capture = captureStreams();
  const code = runCli(args, {
    home,
    streams: capture.streams,
    ...(cwd === undefined ? {} : { cwd }),
  });
  return { code, out: capture.stdout(), err: capture.stderr() };
}

/** Record state, config, store, and every installed byte; coordination files are excluded. */
export function snapshot(home: string, targets: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {
    state: readFileSync(paths(home).stateFile, "base64"),
    config: readFileSync(paths(home).configFile, "base64"),
  };
  for (const root of [paths(home).storeDir, ...targets]) {
    if (!existsSync(root)) continue;
    for (const entry of walk(root)) {
      if (!entry.isFile) continue;
      const path = relative(root, entry.absPath);
      // §14: target lease timestamps do not describe installed skill bytes.
      if (targets.includes(root) && path === ".crew-target.lock.owner") continue;
      out[`${root}:${path}`] = readFileSync(entry.absPath, "base64");
    }
  }
  return out;
}
