/** No applicable update targets preserve the retry baseline (§10.1, C-UPD-45). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import type { Scope } from "../../../src/core/types.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { walk } from "../../../src/util/fs.ts";
import { captureStreams, makeCrewHome, withOriginalAdapter } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

const original = {
  userPath: claudeCodeAdapter.userPath,
  projectPath: claudeCodeAdapter.projectPath,
  detect: claudeCodeAdapter.detect,
};
const skipped = { kind: "skipped", reason: "no applicable agent targets" };
let userRoot: string;
let projectRoot: string;

beforeEach(() => {
  userRoot = makeTempDir("crew-empty-targets-user-");
  projectRoot = makeTempDir("crew-empty-targets-project-");
  claudeCodeAdapter.userPath = () => userRoot;
  claudeCodeAdapter.projectPath = (cwd) => join(cwd, ".claude", "skills");
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

function cli(home: string, args: string[], cwd = projectRoot) {
  const capture = captureStreams();
  const code = runCli(args, { home, cwd, streams: capture.streams });
  return { code, out: capture.stdout(), err: capture.stderr() };
}

function snapshot(home: string): Record<string, Buffer> {
  const out: Record<string, Buffer> = { state: readFileSync(paths(home).stateFile) };
  for (const [label, root] of [
    ["store", paths(home).storeDir],
    ["user", userRoot],
    ["project", projectRoot],
  ]) {
    if (!existsSync(root!)) continue;
    for (const item of walk(root!)) {
      if (item.isFile)
        out[`${label}:${relative(root!, item.absPath)}`] = readFileSync(item.absPath);
    }
  }
  return out;
}

function fixture(scope: Scope) {
  const home = makeCrewHome();
  const repo = makeTempDir("crew-empty-targets-source-");
  makeGitRepo(repo);
  for (const name of ["demo", "healthy"])
    makeSkill(repo, name, skillFrontmatter({ name }), "old bytes");
  commitAll(repo, "v1");
  const installCodes = ["demo", "healthy"].map(
    (name) =>
      cli(home, ["install", `file://${repo}//${name}`, "--scope", scope, "--agent", "claude-code"])
        .code,
  );
  const state = readState(home);
  const before = state.installations.find((entry) => entry.name === "demo")!;
  const dest = join(scope === "user" ? userRoot : join(projectRoot, ".claude", "skills"), "demo");
  const oldMarker = readFileSync(join(dest, ".crew.json"));
  for (const name of ["demo", "healthy"]) writeFileSync(join(repo, name, "NEW.md"), "new bytes");
  const newSha = commitAll(repo, "v2");
  return { home, repo, state, before, dest, oldMarker, newSha, installCodes };
}

for (const scope of ["user", "project"] as const) {
  for (const agents of [[], ["unknown-agent"], ...(scope === "project" ? [["nanobot"]] : [])]) {
    test(`C-UPD-45 ${scope} ${agents.join() || "empty"} targets skip without losing retry state`, () => {
      withOriginalAdapter("nanobot", () => {
        const f = fixture(scope);
        expect(f.installCodes).toEqual([0, 0]);
        const entry = { ...f.before, agents };
        writeState(
          {
            ...f.state,
            installations: [entry, ...f.state.installations.filter((e) => e.name !== "demo")],
          },
          f.home,
        );
        const before = snapshot(f.home);
        const updateCwd = makeTempDir("crew-update-other-cwd-");
        for (const args of [
          ["update", "demo", "--dry-run", "--json"],
          ["outdated", "demo", "--json"],
        ]) {
          const result = cli(f.home, args, updateCwd);
          expect(result.code).toBe(0);
          expect(JSON.parse(result.out).rows[0].outcome).toEqual(skipped);
          expect(snapshot(f.home)).toEqual(before);
        }
        const preview = cli(f.home, ["update", "demo", "--dry-run"], updateCwd);
        expect(preview.code).toBe(0);
        expect(preview.out).toContain("no applicable agent targets");
        expect(preview.out).not.toContain("would update");
        const normal = cli(f.home, ["update", "demo", "--json"], updateCwd);
        expect(normal.code).toBe(0);
        expect(JSON.parse(normal.out).rows[0].outcome).toEqual(skipped);
        expect(snapshot(f.home)).toEqual(before);
        const retry = cli(f.home, ["update", "demo", "healthy"], updateCwd);
        expect(retry.code).toBe(0);
        expect(retry.out).toContain("no applicable agent targets");
        expect(retry.out.trim().split("\n").at(-1)).toBe("1 updated · 1 skipped");
        const after = readState(f.home);
        expect(after.installations.find((e) => e.name === "demo")).toEqual(entry);
        expect(after.installations.find((e) => e.name === "healthy")!.resolved_sha).toBe(f.newSha);
        expect(readFileSync(join(f.dest, ".crew.json"))).toEqual(f.oldMarker);
        expect(existsSync(join(f.dest, "NEW.md"))).toBe(false);
        writeState(
          {
            ...after,
            installations: after.installations.map((e) =>
              e.name === "demo" ? { ...e, agents: ["claude-code"] } : e,
            ),
          },
          f.home,
        );
        const repaired = cli(f.home, ["update", "demo", "--json"], updateCwd);
        expect(repaired.code).toBe(0);
        expect(JSON.parse(repaired.out).rows[0].outcome.per_target).toEqual([
          { agent: "claude-code", kind: "installed" },
        ]);
        expect(readState(f.home).installations.find((e) => e.name === "demo")!.resolved_sha).toBe(
          f.newSha,
        );
        expect(readFileSync(join(f.dest, "NEW.md"), "utf8")).toBe("new bytes");
        expect(JSON.parse(cli(f.home, ["update", "demo", "--json"]).out).rows[0].outcome.kind).toBe(
          "up_to_date",
        );
      });
    });
  }
}

test("C-UPD-45 missing targets do not hide invalid upstream metadata", () => {
  const f = fixture("user");
  expect(f.installCodes).toEqual([0, 0]);
  writeState(
    {
      ...f.state,
      installations: f.state.installations.map((e) =>
        e.name === "demo" ? { ...e, agents: [] } : e,
      ),
    },
    f.home,
  );
  writeFileSync(join(f.repo, "demo", "SKILL.md"), "---\nname: demo\n---\n");
  commitAll(f.repo, "invalid metadata");
  const before = snapshot(f.home);
  for (const flags of [[], ["--dry-run"]]) {
    const result = cli(f.home, ["update", "demo", "--json", ...flags]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out).rows[0].outcome).toMatchObject({
      kind: "failed",
      error: { code: "invalid_skill" },
    });
    expect(snapshot(f.home)).toEqual(before);
  }
});
