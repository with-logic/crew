/**
 * Shared steps for the whole-tap tracking suites (§10.1.1, §11.1): run
 * the CLI, read each entry's attribution and subscription, and add a
 * sibling upstream before an update.
 */

import { join } from "node:path";
import { runCli } from "../../../../src/cli/main.ts";
import { readState } from "../../../../src/state/load.ts";
import { captureStreams } from "../../../helpers/env.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../../helpers/fixtures.ts";

/** Run the CLI against `home` (in `cwd`, for a project-scope install); its exit code. */
export function crew(home: string, args: string[], cwd?: string): number {
  return runCli(args, { home, streams: captureStreams().streams, ...(cwd ? { cwd } : {}) });
}

/**
 * Each installed skill: its tap, its ref (`-` for the default branch),
 * and whether it tracks the tap — `a:mine:-:false`. Auto taps, whose
 * names derive from temp paths, read as `auto`.
 */
export function tracking(home: string, registered: readonly string[] = ["mine"]): string[] {
  return readState(home)
    .installations.map((e) => {
      const tap = registered.includes(e.source.tap) ? e.source.tap : "auto";
      return `${e.name}:${tap}:${e.ref ?? "-"}:${e.tracks_tap === true}`;
    })
    .sort();
}

/** Commit a new skill `c` to `repo`'s default branch, then `crew update`; its exit code. */
export function addSiblingAndUpdate(home: string, repo: string): number {
  makeSkill(join(repo, "skills"), "c", skillFrontmatter({ name: "c" }));
  commitAll(repo, "add c");
  return crew(home, ["update"]);
}
