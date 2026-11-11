/**
 * Several manifests in one run (§9.2): how one project's outcome affects
 * the others, and what `--save` and a dropped line do.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, installed, makeSkillRepo, skillDir, writeManifest } from "../helpers.ts";
import { makeMonorepo } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

describe("several manifests, one run", () => {
  test("C-RC-60 a project that exits non-zero sets the exit code, and the others are still installed", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": ["./broken"],
      "packages/web": [makeSkillRepo(["gamma"])],
    });
    makeSkill(join(root, "packages/api"), "broken", "name: broken");

    const run = crew(home, root, ["install"]);

    expect(run.code).toBe(4);
    expect(installed(home)).toEqual([`alpha@${root}`, `gamma@${join(root, "packages/web")}`]);
  });

  test("C-RC-60 when two projects exit non-zero, the first one's code is the command's", () => {
    const home = makeCrewHome();
    const beta = makeSkillRepo(["beta"]);
    const root = makeMonorepo({ "packages/a": ["./broken"], "packages/b": [beta] });
    const a = join(root, "packages/a");
    const b = join(root, "packages/b");
    makeSkill(a, "broken", "name: broken");
    // In b, a dropped skill that cannot be removed makes that project exit 1.
    expect(crew(home, b, ["install"]).code).toBe(0);
    rmSync(join(skillDir(b, "beta"), ".crew.json"));
    writeManifest(b, []);
    expect(crew(home, a, ["install"]).code).toBe(4);
    expect(crew(home, b, ["install"]).code).toBe(1);

    const run = crew(home, root, ["install", "--json"]);

    expect(run.code).toBe(4);
    const { nested } = JSON.parse(run.stdout) as { nested: { manifest_path: string }[] };
    expect(nested.map((project) => project.manifest_path)).toEqual([
      join(a, ".crewrc"),
      join(b, ".crewrc"),
    ]);
  });

  test("C-RC-60 a project that raises an error stops the run there; earlier projects stay installed", () => {
    const home = makeCrewHome();
    const missing = `file://${join(makeTempDir("crew-repo-"), "missing")}`;
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [missing],
      "packages/web": [makeSkillRepo(["gamma"])],
    });

    const run = crew(home, root, ["install"]);

    expect(run.code).toBe(5);
    expect(run.stderr).toContain("source_unreachable");
    expect(installed(home)).toEqual([`alpha@${root}`]);
  });

  test("C-RC-60 with no active agent every project reports it and nothing is installed", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
    });
    const detect = claudeCodeAdapter.detect;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => false;
    try {
      const run = crew(home, root, ["install", "--json"]);
      expect(run.code).toBe(0);
      const result = JSON.parse(run.stdout) as {
        no_agents: boolean;
        nested: { no_agents: boolean }[];
      };
      expect(result.no_agents).toBe(true);
      expect(result.nested.map((project) => project.no_agents)).toEqual([true]);
    } finally {
      (claudeCodeAdapter as { detect: () => boolean }).detect = detect;
    }
    expect(existsSync(join(home, "state.json"))).toBe(false);
    expect(existsSync(join(root, ".claude"))).toBe(false);
    expect(existsSync(join(root, "packages/api", ".claude"))).toBe(false);
  });

  test("C-RC-60 each project's warnings reach stderr, the root's and a nested one's alike", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
    });
    const api = join(root, "packages/api");
    expect(crew(home, root, ["install"]).code).toBe(0);
    // A dropped skill whose directory is now a link is kept, with a warning.
    const elsewhere = makeTempDir("crew-elsewhere-");
    renameSync(skillDir(root, "alpha"), join(elsewhere, "alpha"));
    symlinkSync(join(elsewhere, "alpha"), skillDir(root, "alpha"));
    renameSync(skillDir(api, "beta"), join(elsewhere, "beta"));
    symlinkSync(join(elsewhere, "beta"), skillDir(api, "beta"));
    writeManifest(root, []);
    writeManifest(api, []);

    const run = crew(home, root, ["install"]);

    expect(run.code).toBe(0);
    expect(run.stderr).toContain("kept `alpha`");
    expect(run.stderr).toContain("kept `beta`");
  });

  test("C-RC-61 a line dropped from a nested manifest removes that project's skill only", () => {
    const home = makeCrewHome();
    const shared = makeSkillRepo(["alpha"]);
    const root = makeMonorepo({ ".": [shared], "packages/api": [shared] });
    const api = join(root, "packages/api");
    expect(crew(home, root, ["install"]).code).toBe(0);
    expect(installed(home)).toEqual([`alpha@${root}`, `alpha@${api}`]);
    expect(existsSync(join(skillDir(root, "alpha"), "SKILL.md"))).toBe(true);
    expect(existsSync(join(skillDir(api, "alpha"), "SKILL.md"))).toBe(true);

    writeManifest(api, []);
    const run = crew(home, root, ["install", "--json"]);

    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { nested: { removed: { name: string }[] }[] };
    expect(result.nested[0]?.removed.map((record) => record.name)).toEqual(["alpha"]);
    expect(installed(home)).toEqual([`alpha@${root}`]);
    expect(existsSync(skillDir(api, "alpha"))).toBe(false);
    expect(existsSync(join(skillDir(root, "alpha"), "SKILL.md"))).toBe(true);
  });

  test("C-RC-61 --save edits and installs the governing project only", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({ ".": [], "packages/api": [makeSkillRepo(["beta"])] });

    const run = crew(home, root, ["install", "--save", makeSkillRepo(["alpha"]), "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { nested?: unknown }).nested).toBeUndefined();
    expect(installed(home)).toEqual([`alpha@${root}`]);
  });

  test("C-RC-61 uninstall --save edits and installs the governing project only", () => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const root = makeMonorepo({ ".": [alpha], "packages/api": [makeSkillRepo(["beta"])] });
    const api = join(root, "packages/api");
    expect(crew(home, root, ["install"]).code).toBe(0);
    // If the nested project were installed again, this dropped line would remove beta.
    writeManifest(api, []);

    const run = crew(home, root, ["uninstall", "--save", alpha, "--json"]);

    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as { nested?: unknown }).nested).toBeUndefined();
    expect(installed(home)).toEqual([`beta@${api}`]);
  });
});
