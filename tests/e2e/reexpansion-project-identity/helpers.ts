/** Real local tap and install-location fixtures for C-UPD-43 (§10.1.1). */

import { strictEqual } from "node:assert";
import { runCli } from "../../../src/cli/main.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/types.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

export const MODES = [["update"], ["update", "--dry-run"], ["outdated"]] as const;

export function fixture() {
  const home = makeCrewHome();
  const source = makeTempDir("crew-project-identity-source-");
  makeSkill(source, "alpha", skillFrontmatter({ name: "alpha" }));
  makeGitRepo(source);
  const projects = [
    makeTempDir("crew-project-identity-a-"),
    makeTempDir("crew-project-identity-b-"),
  ];
  const call = (args: readonly string[], cwd = home) => {
    const captured = captureStreams();
    const code = runCli([...args], { home, cwd, streams: captured.streams });
    return { code, out: captured.stdout(), err: captured.stderr() };
  };
  const setup = [
    call(["tap", "remove", "core", "--force"]).code,
    call(["tap", "add", source, "team"]).code,
    call(["install", "team", "--agent", "claude-code"]).code,
  ];
  for (const project of projects)
    setup.push(
      call(["install", "team", "--scope", "project", "--agent", "claude-code"], project).code,
    );
  return { home, source, projects, call, setup };
}

/** Same-named outcomes must identify each project, while user rows omit the key. */
export function locations(
  rows: readonly (TapReexpandRow & { readonly project_root?: string })[],
): (string | undefined)[] {
  return rows
    .map((row) => {
      if (row.scope === "project") return row.project_root;
      strictEqual(Object.hasOwn(row, "project_root"), false);
      return "user";
    })
    .sort();
}
