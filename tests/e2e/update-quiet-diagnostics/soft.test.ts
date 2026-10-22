/** Soft-only tap errors retain silent quiet exit 0 (§5.2, §10.1.1; unit226 gate characterization). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target = "";
beforeEach(() => {
  target = makeTempDir("crew226-soft-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
});
function invoke(home: string, args: string[]) {
  const c = captureStreams();
  const code = runCli(args, { home, streams: c.streams });
  const result = { args, code, stdout: c.stdout(), stderr: c.stderr() };
  return result;
}
for (const expectedCode of ["no_skills_found", "invalid_ref"]) {
  test(`C-UPD-42 soft-only ${expectedCode} tap_error remains exit 0 and quiet silence in update/dry/outdated`, () => {
    const home = makeCrewHome();
    expect(invoke(home, ["tap", "remove", "core", "--force"]).code).toBe(0);
    const repo = makeTempDir("crew226-soft-source-");
    const nested = join(repo, "nested");
    mkdirSync(nested);
    makeSkill(nested, "alpha", skillFrontmatter({ name: "alpha" }));
    if (expectedCode === "invalid_ref") {
      makeGitRepo(repo);
      expect(invoke(home, ["tap", "add", `file://${repo}//nested`, "fixture"]).code).toBe(0);
    } else {
      expect(invoke(home, ["tap", "add", nested, "fixture"]).code).toBe(0);
    }
    expect(invoke(home, ["install", "fixture", "--agent", "claude-code"]).code).toBe(0);
    for (const args of [["update"], ["update", "--dry-run"], ["outdated"]]) {
      const healthy = invoke(home, [...args, "--quiet"]);
      expect(healthy).toMatchObject({ code: 0, stdout: "", stderr: "" });
    }
    const beforeState = readFileSync(paths(home).stateFile, "utf8");
    const marker = join(target, "alpha", ".crew.json");
    const beforeMarker = readFileSync(marker, "utf8");
    rmSync(nested, { recursive: true });
    if (expectedCode === "invalid_ref") {
      symlinkSync(makeTempDir("crew226-soft-outside-"), nested);
      commitAll(repo, "replace tracked subpath with escaping symlink");
    }
    for (const args of [["update"], ["update", "--dry-run"], ["outdated"]]) {
      const normal = invoke(home, args);
      expect(normal.code).toBe(0);
      expect(normal.stdout).toContain(expectedCode);
      expect(normal.stderr).toBe("");
      const json = invoke(home, [...args, "--json"]);
      expect(json.code).toBe(0);
      expect(JSON.parse(json.stdout).tap_reexpand_rows[0]).toMatchObject({
        kind: "tap_error",
        error: { code: expectedCode },
      });
      const quiet = invoke(home, [...args, "--quiet"]);
      expect(quiet.code).toBe(0);
      expect(quiet.stdout).toBe("");
      expect(quiet.stderr).toBe("");
      expect(readFileSync(paths(home).stateFile, "utf8")).toBe(beforeState);
      expect(readFileSync(marker, "utf8")).toBe(beforeMarker);
    }
  });
}
