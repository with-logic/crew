/**
 * Shared fixtures for the project-manifest e2e tests (§9.2).
 *
 * Each test builds a real project directory with a real `.crewrc`, real
 * skill directories, and real local git repositories, then drives
 * `crew install` through `runCli`.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { MANIFEST_FILENAME } from "../../../src/manifest/index.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

/** Create a project directory whose `.crewrc` holds `lines`. */
export function makeProject(lines: readonly string[]): string {
  const project = makeTempDir("crew-proj-");
  writeManifest(project, lines);
  return project;
}

/** Write (or replace) the `.crewrc` in `dir`. */
export function writeManifest(dir: string, lines: readonly string[]): string {
  const file = join(dir, MANIFEST_FILENAME);
  writeFileSync(file, lines.map((line) => `${line}\n`).join(""));
  return file;
}

/** Add a valid skill directory at `<project>/<relativeDir>/<name>`. */
export function addLocalSkill(project: string, relativeDir: string, name: string): void {
  const parent = join(project, relativeDir);
  mkdirSync(parent, { recursive: true });
  makeSkill(parent, name, skillFrontmatter({ name }));
}

/** A local git repository holding one skill per name; returns its `file://` reference. */
export function makeSkillRepo(names: readonly string[]): string {
  const repo = makeTempDir("crew-repo-");
  for (const name of names) makeSkill(repo, name, skillFrontmatter({ name }));
  makeGitRepo(repo);
  return `file://${repo}`;
}

/** Run `crew <args>` in `cwd` and capture what it printed. */
export function crew(home: string, cwd: string, args: readonly string[]) {
  const captured = captureStreams();
  const code = runCli([...args], { home, cwd, streams: captured.streams });
  return { code, stdout: captured.stdout(), stderr: captured.stderr() };
}

/** `name@user` or `name@<project_root>` for every state entry, sorted. */
export function installed(home: string): string[] {
  return readState(home)
    .installations.map((e) => `${e.name}@${e.scope === "user" ? "user" : e.project_root}`)
    .sort();
}

/** Names of the manifest-owned state entries, sorted. */
export function ownedNames(home: string): string[] {
  const names: string[] = [];
  for (const entry of readState(home).installations) {
    if (entry.manifest_owned === true) names.push(entry.name);
  }
  return names.sort();
}

/**
 * Run a verbose bare install, calling `during` once, at the moment the
 * first skill starts installing: after the manifest and lockfile were
 * read, before ownership is reconciled or the lockfile written.
 */
export function installAnd(home: string, project: string, during: () => void): number {
  let done = false;
  return runCli(["install", "--verbose"], {
    home,
    cwd: project,
    streams: {
      stdout: () => {},
      stderr: (chunk) => {
        if (done || !chunk.includes("installing")) return;
        done = true;
        during();
      },
    },
  });
}
