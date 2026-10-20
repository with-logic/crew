/**
 * Shared fixtures for the discovery folder-link tests (§9 step 5 "Folder
 * links", step 6; C-SPEC-17): a git repository with committed links, and
 * folders outside it holding skills crew must never read.
 */

import { chmodSync, existsSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { runCli } from "../../../../src/cli/main.ts";
import { paths } from "../../../../src/core/paths.ts";
import { captureStreams } from "../../../helpers/env.ts";
import {
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../../helpers/fixtures.ts";

/**
 * A folder outside every repository holding skill `name` (declaring
 * `declares`). Unless `readable`, crew can't read its SKILL.md, so a run
 * that read it would fail as `source_unreachable`, not as a refused link.
 */
export function outsideSkill(name: string, readable = false, declares = name): string {
  const folder = makeSkill(
    makeTempDir("crew-outside-"),
    name,
    skillFrontmatter({ name: declares }),
  );
  if (!readable) chmodSync(join(folder, "SKILL.md"), 0o000);
  return folder;
}

/** A skill `name` at `parent`, declaring its own name. */
export function skillAt(parent: string, name: string, dependencies?: readonly string[]): string {
  const deps = dependencies === undefined ? {} : { dependencies };
  return makeSkill(parent, name, skillFrontmatter({ name, ...deps }));
}

/** Make `at` a link with text `target`, creating its parent. */
export function link(target: string, at: string): void {
  mkdirSync(dirname(at), { recursive: true });
  symlinkSync(target, at);
}

/** A new git repository laid out by `build`, committed. */
export function gitRepo(build: (repo: string) => void): string {
  const repo = makeTempDir("crew-repo-");
  build(repo);
  makeGitRepo(repo);
  return repo;
}

/** Run the CLI against `home`: its exit code, and its output on one line. */
export function crew(home: string, args: string[]): { code: number; out: string } {
  const cap = captureStreams();
  const code = runCli(args, { home, streams: cap.streams });
  // Collapse the renderer's line wrapping so messages match as one line.
  return { code, out: (cap.stdout() + cap.stderr()).replace(/\s+/g, " ") };
}

/** The names of the skills in crew's store. */
export function storedNames(home: string): string[] {
  const store = paths(home).storeDir;
  if (!existsSync(store)) return [];
  return readdirSync(store)
    .map((entry) => entry.split("@")[0]!)
    .sort();
}

/** The skill names `crew search --tap <tap>` lists, and any warnings beside them. */
export function searched(home: string, tap: string): { names: string[]; warnings: unknown[] } {
  const cap = captureStreams();
  runCli(["search", "--tap", tap, "--json"], { home, streams: cap.streams });
  const out = JSON.parse(cap.stdout()) as { hits: { name: string }[]; warnings: unknown[] };
  return { names: out.hits.map((h) => h.name).sort(), warnings: out.warnings };
}
