/** Real individual Git-child fixtures and preserved resources (§10.1, C-UPD-11/13/18/18f). */

import { readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import type { UpdateSelector } from "../../../src/commands/update/plan.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { snapshot } from "./snapshot.ts";

export interface Targets {
  readonly user: string;
  readonly project: string;
}
export interface UpdateJson {
  readonly rows: readonly UpdateRow[];
  readonly tap_reexpand_rows: readonly unknown[];
  readonly tap_rows: readonly {
    readonly name: string;
    readonly kind: string;
    readonly url: string;
  }[];
  readonly dry_run: boolean;
  readonly selectors: readonly UpdateSelector[];
}
export const MODES = ["update", "dry-run", "outdated"] as const;
export type Mode = (typeof MODES)[number];
export type Change = "deleted" | "missing-manifest" | "invalid-manifest" | "permission";

/** Invoke the actual CLI while keeping streams available for failure evidence. */
export function invoke(home: string, cwd: string, args: string[]) {
  const capture = captureStreams();
  const code = runCli(args, { home, cwd, streams: capture.streams });
  return { code, stdout: capture.stdout(), stderr: capture.stderr() };
}

/** Every fixture starts from an unreferenced, unpinned individual install. */
export function fixture(targets: Targets) {
  const home = makeCrewHome();
  const cwd = makeTempDir("crew-individual-project-");
  const repo = makeTempDir("crew-individual-repo-");
  makeGitRepo(repo);
  for (const name of ["demo", "healthy", "unrelated"]) {
    const skill = makeSkill(repo, name, skillFrontmatter({ name }), `${name} original\n`);
    writeFileSync(join(skill, "resource.bin"), Buffer.from([0, 128, 255]));
    symlinkSync("resource.bin", join(skill, "resource-link"));
  }
  commitAll(repo, "individual skills");
  const setup = [
    invoke(home, cwd, ["tap", "remove", "core", "--force"]),
    invoke(home, cwd, ["tap", "add", `file://${repo}`, "fixture"]),
    invoke(home, cwd, [
      "install",
      "fixture/demo",
      "fixture/healthy",
      "fixture/unrelated",
      "--agent",
      "claude-code",
      "--agent",
      "codex",
    ]),
  ];
  return { home, cwd, repo, targets, setup, original: readState(home) };
}
export type Fixture = ReturnType<typeof fixture>;

/** Move upstream without ever installing the newly discovered sibling. */
export function changeUpstream(f: Fixture, change: Change): string {
  const demo = join(f.repo, "demo");
  if (change === "deleted") rmSync(demo, { recursive: true });
  if (change === "missing-manifest") rmSync(join(demo, "SKILL.md"));
  if (change === "invalid-manifest") writeFileSync(join(demo, "SKILL.md"), "invalid frontmatter\n");
  writeFileSync(join(f.repo, "healthy", "resource.bin"), "healthy update\n");
  writeFileSync(join(f.repo, "unrelated", "resource.bin"), "unselected update\n");
  makeSkill(f.repo, "new-sibling", skillFrontmatter({ name: "new-sibling" }));
  return commitAll(f.repo, `upstream ${change}`);
}

/** Default to explicit tap-qualified selectors so unrelated installs are never processed. */
export function runMode(
  f: Fixture,
  mode: Mode,
  json: boolean,
  selectors = ["fixture/demo", "fixture/healthy"],
) {
  const args = [mode === "outdated" ? "outdated" : "update", ...selectors];
  if (mode === "dry-run") args.push("--dry-run");
  if (json) args.push("--json");
  return invoke(f.home, f.cwd, args);
}

/** Preview boundary includes all redirected adapters and the entire non-clone home. */
export function allResources(f: Fixture) {
  return {
    home: snapshot(f.home, ["repos"]),
    user: snapshot(f.targets.user),
    project: snapshot(f.targets.project),
  };
}

/** Preserve the complete absent/unselected entries, installed copies, markers, and store trees. */
export function retainedResources(f: Fixture, names = ["demo", "unrelated"]) {
  const installed: Record<string, unknown> = {};
  for (const agent of readdirSync(f.targets.user)) {
    for (const name of names)
      installed[`${agent}/${name}`] = snapshot(join(f.targets.user, agent, name));
  }
  const stores: Record<string, unknown> = {};
  for (const name of readdirSync(join(f.home, "store"))) {
    if (names.some((skill) => name.startsWith(`${skill}@`)))
      stores[name] = snapshot(join(f.home, "store", name));
  }
  return {
    entries: readState(f.home).installations.filter((entry) => names.includes(entry.name)),
    installed,
    stores,
  };
}
