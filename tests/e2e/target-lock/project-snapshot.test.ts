/** Roots absent at preparation remain skipped even when real git work later recreates them (§14). */
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { runCli } from "../../../src/cli/main.ts";
import { type GitRunner, resetGitRunner, setGitRunner } from "../../../src/git/exec.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetGitRunner();
});

test("C-CONC-07 a later project-root reappearance admits neither existing entries nor new tap children", () => {
  const home = makeCrewHome();
  const cwd = makeTempDir();
  const user = join(makeTempDir(), "skills");
  const project = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => user;
    adapter.projectPath = (root) => join(root, "skills");
    adapter.detect = () => adapter.name === "claude-code";
  }
  const repo = makeTempDir();
  const source = makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }), "old bytes");
  makeGitRepo(repo);
  const invoke = (args: readonly string[], root = cwd) => {
    const streams = captureStreams();
    const code = runCli([...args, "--json"], { home, cwd: root, streams: streams.streams });
    return { code, output: JSON.parse(streams.stdout()), stderr: streams.stderr() };
  };
  expect(invoke(["tap", "add", `file://${repo}`, "fixture"]).code).toBe(0);
  expect(invoke(["install", "fixture", "--tap", "--agent", "claude-code"]).code).toBe(0);
  expect(
    invoke(["install", "fixture", "--tap", "--scope", "project", "--agent", "claude-code"], project)
      .code,
  ).toBe(0);
  const state = readState(home);
  writeState(
    {
      ...state,
      installations: [...state.installations].sort(
        (a, b) => Number(a.scope === "project") - Number(b.scope === "project"),
      ),
    },
    home,
  );
  const before = readState(home).installations.filter((entry) => entry.scope === "project");
  rmSync(project, { recursive: true });
  writeFileSync(
    join(source, "SKILL.md"),
    `${readFileSync(join(source, "SKILL.md"), "utf8")}\nnew bytes`,
  );
  makeSkill(repo, "newbie", skillFrontmatter({ name: "newbie" }));
  commitAll(repo, "new revision");
  let appeared = false;
  let real: GitRunner;
  real = setGitRunner((args, options) => {
    const result = real(args, options);
    // The ordinary git boundary is observed only after target acquisition.
    if (!appeared && existsSync(join(user, ".crew-target.lock"))) {
      mkdirSync(project);
      appeared = true;
    }
    return result;
  });
  const result = invoke(["update", "fixture"]);
  expect(result.code, result.stderr).toBe(0);
  expect(appeared).toBe(true);
  expect(
    result.output.rows.find((row: { scope: string }) => row.scope === "project").outcome.kind,
  ).toBe("missing_project_root");
  expect(
    result.output.tap_reexpand_rows.filter((row: { scope: string }) => row.scope === "project"),
  ).toEqual([]);
  expect(existsSync(join(project, "skills"))).toBe(false);
  expect(readState(home).installations.filter((entry) => entry.scope === "project")).toEqual(
    before,
  );
  expect(existsSync(join(user, "newbie", ".crew.json"))).toBe(true);
});
