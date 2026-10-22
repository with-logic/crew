/** Real CLI and local Git fixtures for aggregate discovery warnings (§9, §16.6). */

import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

export const WARNING =
  "warning: Git skill discovery skipped symlink entries; link targets were not followed.";

export type Layout = "flat" | "skills" | "namespace" | "recursive" | "linked-skills";

export interface CliResult {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

export function cli(home: string, args: readonly string[], cwd?: string): CliResult {
  const capture = captureStreams();
  const code = runCli([...args], {
    home,
    streams: capture.streams,
    ...(cwd === undefined ? {} : { cwd }),
  });
  return { code, out: capture.stdout(), err: capture.stderr() };
}

export function freshHome(): { readonly home: string; readonly reset: CliResult } {
  const home = makeCrewHome();
  const reset = cli(home, ["tap", "remove", "core", "--force"]);
  return { home, reset };
}

export function source(layout: Layout, name = "healthy", links = true) {
  const repo = makeTempDir("crew-discovery-warning-");
  const parent =
    layout === "skills"
      ? join(repo, "skills")
      : layout === "namespace"
        ? join(repo, "skills", "group")
        : layout === "recursive"
          ? join(repo, "projects", "flows")
          : repo;
  const skill = makeSkill(parent, name, skillFrontmatter({ name }));
  symlinkSync("absent-asset-target", join(skill, "asset-link"));
  if (links) {
    symlinkSync("absent-discovery-target", join(parent, "excluded-entry"));
    symlinkSync("another-absent-target", join(parent, "excluded-entry-two"));
  }
  if (layout === "linked-skills") symlinkSync("absent-layout-target", join(repo, "skills"));
  makeGitRepo(repo);
  return { repo, parent, skill };
}

export function register(home: string, repo: string, layout: Layout, name = "fixture"): CliResult {
  return cli(home, [
    "tap",
    "add",
    ...(layout === "recursive" ? ["--recursive"] : []),
    `file://${repo}`,
    name,
  ]);
}
