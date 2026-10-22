/** Rejected directory-tap candidates stay visible during updates (§9, §10.1.1). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import { readState } from "../../src/state/load.ts";
import { walk } from "../../src/util/fs.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";
import type { UpdateJson } from "./update-dry-run/helpers.ts";

let target: string;
const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
beforeEach(() => {
  target = makeTempDir("crew-invalid-update-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});

function cli(home: string, args: string[]) {
  const captured = captureStreams();
  const code = runCli(args, { home, streams: captured.streams });
  return { code, out: captured.stdout(), err: captured.stderr() };
}

function fixture() {
  const home = makeCrewHome();
  cli(home, ["tap", "remove", "core", "--force"]);
  const repo = makeTempDir("crew-invalid-update-repo-");
  makeGitRepo(repo);
  return { home, repo };
}

function snapshot(home: string): Map<string, Buffer> {
  const result = new Map([[paths(home).stateFile, readFileSync(paths(home).stateFile)]]);
  for (const root of [target, paths(home).storeDir]) {
    for (const entry of walk(root)) {
      if (entry.isFile) result.set(entry.absPath, readFileSync(entry.absPath));
    }
  }
  return result;
}
const badPaths = ["bad-name", "bad-yaml", "bad-link"];
for (const tracked of [false, true]) {
  for (const dryRun of [false, true]) {
    for (const json of [false, true]) {
      test(`C-UPD-18c ${tracked ? "tracked" : "new"} rejected manifests, dry=${dryRun}, json=${json}`, () => {
        const { home, repo } = fixture();
        makeSkill(repo, "healthy", skillFrontmatter({ name: "healthy" }));
        if (tracked) {
          for (const name of badPaths) makeSkill(repo, name, skillFrontmatter({ name }));
        }
        commitAll(repo, "initial healthy source");
        expect(cli(home, ["tap", "add", `file://${repo}`, "team"]).code).toBe(0);
        expect(cli(home, ["install", "team"]).code).toBe(0);
        const beforeState = readState(home);
        const before = snapshot(home);
        makeSkill(repo, "bad-name", skillFrontmatter({ name: "BAD_NAME" }));
        makeSkill(repo, "bad-yaml", "name: [broken");
        makeSkill(repo, "bad-link", skillFrontmatter({ name: "bad-link" }));
        rmSync(join(repo, "bad-link", "SKILL.md"));
        symlinkSync("../healthy/SKILL.md", join(repo, "bad-link", "SKILL.md"));
        makeSkill(repo, "healthy", skillFrontmatter({ name: "healthy" }), "healthy update");
        makeSkill(repo, "added", skillFrontmatter({ name: "added" }));
        const sha = commitAll(repo, "invalid manifests and healthy changes");
        const result = cli(home, [
          "update",
          ...(dryRun ? ["--dry-run"] : []),
          ...(json ? ["--json"] : []),
        ]);
        expect(result.code).toBe(1);
        expect(result.err).toBe("");
        if (json) {
          const parsed = JSON.parse(result.out) as UpdateJson;
          const errors = parsed.tap_reexpand_rows.filter((row) => row.kind === "tap_error");
          expect(errors).toHaveLength(3);
          for (const name of badPaths) {
            expect(errors).toContainEqual(
              expect.objectContaining({
                name: "team",
                tap: "team",
                error: { code: "invalid_skill", message: expect.stringContaining(name) },
              }),
            );
            if (tracked)
              expect(parsed.rows.find((row) => row.name === name)?.outcome).toMatchObject({
                kind: "failed",
                error: { code: "invalid_skill" },
              });
          }
          expect(parsed.tap_reexpand_rows).toContainEqual(
            expect.objectContaining({ name: "added", kind: dryRun ? "would_add" : "added" }),
          );
          expect(parsed.rows.find((row) => row.name === "healthy")?.outcome).toMatchObject({
            kind: dryRun ? "would_update" : "updated",
            new_sha: sha,
          });
          expect(parsed.rows.some((row) => row.outcome.kind === "source_gone")).toBe(false);
        } else {
          for (const name of badPaths) expect(result.out).toContain(name);
          expect(result.out).toContain("invalid_skill");
          expect(result.out).toContain("invalid characters");
          expect(result.out).toContain("isn't valid YAML");
          expect(result.out).toContain("must not be a symbolic link");
          expect(result.out).toContain("added");
          expect(result.out).not.toContain("removed upstream");
          expect(result.out).toContain(`${tracked ? 6 : 3} failures`);
        }
        if (dryRun) expect(snapshot(home)).toEqual(before);
        else {
          const afterState = readState(home);
          for (const name of badPaths) {
            expect(afterState.installations.find((entry) => entry.name === name)).toEqual(
              beforeState.installations.find((entry) => entry.name === name),
            );
            if (tracked) {
              for (const file of ["SKILL.md", ".crew.json"]) {
                const path = join(target, name, file);
                expect(readFileSync(path).equals(before.get(path)!)).toBe(true);
              }
            } else expect(existsSync(join(target, name))).toBe(false);
          }
          expect(readFileSync(join(target, "healthy", "SKILL.md"), "utf8")).toContain(
            "healthy update",
          );
          expect(existsSync(join(target, "added", "SKILL.md"))).toBe(true);
        }
      });
    }
  }
}

test("C-UPD-18c/36 rejected diagnostics respect namespace-only selectors", () => {
  const { home, repo } = fixture();
  makeSkill(repo, "skills/selected/base", skillFrontmatter({ name: "base" }));
  makeSkill(repo, "skills/other/peer", skillFrontmatter({ name: "peer" }));
  commitAll(repo, "namespaced source");
  expect(cli(home, ["tap", "add", `file://${repo}`, "team"]).code).toBe(0);
  expect(cli(home, ["install", "team"]).code).toBe(0);
  makeSkill(repo, "skills/other/ignored", skillFrontmatter({ name: "BAD_NAME" }));
  commitAll(repo, "invalid candidate outside selection");
  const outside = cli(home, ["update", "team/selected", "--dry-run", "--json"]);
  expect(outside.code).toBe(0);
  expect((JSON.parse(outside.out) as UpdateJson).tap_reexpand_rows).toEqual([]);
  makeSkill(repo, "skills/selected/rejected", skillFrontmatter({ name: "BAD_NAME" }));
  commitAll(repo, "invalid candidate inside selection");
  const inside = cli(home, ["update", "team/selected", "--dry-run", "--json"]);
  expect(inside.code).toBe(1);
  expect((JSON.parse(inside.out) as UpdateJson).tap_reexpand_rows).toEqual([
    expect.objectContaining({
      name: "team",
      kind: "tap_error",
      error: {
        code: "invalid_skill",
        message: expect.stringContaining("skills/selected/rejected"),
      },
    }),
  ]);
});

test("C-UPD-18c an invalid root reports the root path without inventing a skill name", () => {
  const { home, repo } = fixture();
  makeSkill(repo, ".", skillFrontmatter({ name: "original" }));
  commitAll(repo, "valid root");
  expect(cli(home, ["tap", "add", `file://${repo}`, "team"]).code).toBe(0);
  expect(cli(home, ["install", "team"]).code).toBe(0);
  const before = snapshot(home);
  makeSkill(repo, ".", "name: [broken");
  commitAll(repo, "invalid root");
  const result = cli(home, ["update", "--dry-run", "--json"]);
  expect(result.code).toBe(1);
  const parsed = JSON.parse(result.out) as UpdateJson;
  expect(parsed.tap_reexpand_rows).toMatchObject([
    {
      name: "team",
      kind: "tap_error",
      error: { code: "invalid_skill", message: expect.stringContaining("(root)") },
    },
  ]);
  expect(parsed.rows[0]?.outcome).toMatchObject({
    kind: "failed",
    error: { code: "invalid_skill" },
  });
  expect(snapshot(home)).toEqual(before);
});
