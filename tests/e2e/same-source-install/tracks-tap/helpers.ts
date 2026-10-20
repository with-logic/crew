/**
 * Shared steps for the whole-tap tracking suites (§10.1.1, §11.1): run
 * the CLI, read each entry's attribution and subscription, add a sibling
 * upstream before an update, and plant markers — or paths that can't hold
 * one — at install folders (§5.4, §16.5).
 */

import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../../src/cli/main.ts";
import { readConfig } from "../../../../src/config/load.ts";
import type { Marker } from "../../../../src/core/types.ts";
import { readState } from "../../../../src/state/load.ts";
import { readJson } from "../../../../src/util/json.ts";
import { captureStreams } from "../../../helpers/env.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";

type Redirect = Pick<typeof codexAdapter, "userPath" | "projectPath" | "detect">;

/**
 * Point claude-code, codex, and gemini-cli at fresh skills folders, all
 * detected; returns an undo. Every install in these suites names its
 * agents, so each takes part only where a test names it.
 */
export function redirectAgents(): { restore: () => void } {
  const originals: (readonly [Redirect, Redirect])[] = [];
  for (const [adapter, dot] of [
    [claudeCodeAdapter, ".claude"],
    [codexAdapter, ".codex"],
    [geminiCliAdapter, ".gemini"],
  ] as const) {
    const { userPath, projectPath, detect } = adapter;
    originals.push([adapter, { userPath, projectPath, detect }]);
    const root = makeTempDir("crew-agent-");
    adapter.userPath = () => root;
    adapter.projectPath = (cwd: string) => join(cwd, dot, "skills");
    adapter.detect = () => true;
  }
  return {
    restore: () => {
      for (const [adapter, original] of originals) Object.assign(adapter, original);
    },
  };
}

/** The agent flags these suites install with. */
export const CLAUDE = ["--agent", "claude-code"];
export const BOTH = [...CLAUDE, "--agent", "codex"];

/** Whether a config tap of that name remains. */
export function tapKept(home: string, name: string): boolean {
  return readConfig(home).taps.some((t) => t.name === name);
}

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
  const entry = readState(home).installations.find((e) => e.name === name);
  if (!entry) throw new Error(`no state entry named ${name}`);
  return entry.source.tap;
}

/** The tap named in the crew marker of `name` under agent skills folder `root`. */
export function markerTap(root: string, name: string): string {
  return readJson<Marker>(join(root, name, ".crew.json")).tap_name;
}

/** Write a crew marker into `folder`: the one in `from`, with `changes` over it. */
export function plantMarker(folder: string, from: string, changes: Partial<Marker>): void {
  mkdirSync(folder, { recursive: true });
  const marker = readJson<Marker>(join(from, ".crew.json"));
  writeFileSync(join(folder, ".crew.json"), JSON.stringify({ ...marker, ...changes }));
}

/** Commit a new skill `c` to `repo`'s default branch, then `crew update`; its exit code. */
export function addSiblingAndUpdate(home: string, repo: string): number {
  makeSkill(join(repo, "skills"), "c", skillFrontmatter({ name: "c" }));
  commitAll(repo, "add c");
  return crew(home, ["update"]);
}

/**
 * Paths at an install folder that can't hold a marker, and so name
 * nothing: no move claims one, nor does collection (§5.4, §10.1, §16.5). Each plants over whatever is at `folder` and
 * returns a check that it is still as planted.
 */
export const NOT_MARKERS: readonly (readonly [string, (folder: string) => () => boolean])[] = [
  [
    "a file where the folder goes",
    (folder) => {
      rmSync(folder, { recursive: true, force: true });
      writeFileSync(folder, "a file\n");
      return () => readFileSync(folder, "utf8") === "a file\n";
    },
  ],
  [
    "a folder where the marker goes",
    (folder) => {
      rmSync(folder, { recursive: true, force: true });
      mkdirSync(join(folder, ".crew.json"), { recursive: true });
      return () => lstatSync(join(folder, ".crew.json")).isDirectory();
    },
  ],
  [
    "a link that loops where the folder goes",
    (folder) => {
      rmSync(folder, { recursive: true, force: true });
      symlinkSync(folder, folder);
      return () => readlinkSync(folder) === folder;
    },
  ],
];
