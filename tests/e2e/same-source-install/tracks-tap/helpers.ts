/**
 * Shared steps for the whole-tap tracking suites (§10.1.1, §11.1): run
 * the CLI, read each entry's attribution and subscription, and add a
 * sibling upstream before an update.
 */

import { readFileSync } from "node:fs";
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
 * and whether it tracks the tap — `a:mine:-:false`. Any tap but the
 * registered `mine` reads as `auto`: auto tap names derive from temp
 * paths. Tests that care which auto tap compare names directly.
 */
export function tracking(home: string): string[] {
  return readState(home)
    .installations.map((e) => {
      const tap = e.source.tap === "mine" ? e.source.tap : "auto";
      return `${e.name}:${tap}:${e.ref ?? "-"}:${e.tracks_tap === true}`;
    })
    .sort();
}

/** The tap `name`'s entry is attributed to; throws when nothing is installed by that name. */
export function tapOf(home: string, name: string): string {
  return readState(home).installations.find((e) => e.name === name)!.source.tap;
}

/** The tap named in the crew marker of `name` under agent skills folder `root`. */
export function markerTap(root: string, name: string): string {
  return JSON.parse(readFileSync(join(root, name, ".crew.json"), "utf8")).tap_name;
}

/** Commit a new skill `c` to `repo`'s default branch, then `crew update`; its exit code. */
export function addSiblingAndUpdate(home: string, repo: string): number {
  makeSkill(join(repo, "skills"), "c", skillFrontmatter({ name: "c" }));
  commitAll(repo, "add c");
  return crew(home, ["update"]);
}
