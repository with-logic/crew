/**
 * Bare `crew install` guards (§9.2): when there is no usable manifest,
 * when the manifest is invalid, and which flags a bare install refuses.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";
import { addLocalSkill, crew, installed, makeProject, writeManifest } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

describe("bare crew install guards", () => {
  test("C-RC-06 with no manifest it is a usage_error that mentions .crewrc", () => {
    const run = crew(makeCrewHome(), makeTempDir("crew-proj-"), ["install"]);
    expect(run.code).toBe(4);
    expect(run.stderr).toContain("usage_error");
    expect(run.stderr).toContain(".crewrc");
  });

  for (const kind of ["directory", "file"] as const) {
    test(`C-RC-07 a manifest above a repository root (.git ${kind}) does not govern the repository`, () => {
      const home = makeCrewHome();
      const outer = makeProject(["./tools/gamma"]);
      addLocalSkill(outer, "tools", "gamma");
      const repo = join(outer, "repo");
      mkdirSync(join(repo, "src"), { recursive: true });
      // A worktree's `.git` is a file; a clone's is a directory.
      if (kind === "directory") mkdirSync(join(repo, ".git"));
      else writeFileSync(join(repo, ".git"), "gitdir: elsewhere\n");

      const run = crew(home, join(repo, "src"), ["install", "--json"]);

      expect(run.code).toBe(4);
      expect((JSON.parse(run.stdout) as { error: { name: string } }).error.name).toBe(
        "usage_error",
      );
      expect(installed(home)).toEqual([]);
    });
  }

  test("C-RC-08 a directory named .crewrc is skipped in favor of the manifest above it", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");
    const nested = join(project, "packages");
    mkdirSync(join(nested, ".crewrc"), { recursive: true });

    expect(crew(home, nested, ["install"]).code).toBe(0);
    expect(installed(home)).toEqual([`gamma@${project}`]);
  });

  test("C-RC-08 a symbolic link named .crewrc is not a manifest and is never read", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const target = join(makeTempDir("crew-secret-"), "secrets.env");
    writeFileSync(target, "API_TOKEN=do-not-print\n");
    symlinkSync(target, join(project, ".crewrc"));

    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(4);
    expect((JSON.parse(run.stdout) as { error: { name: string } }).error.name).toBe("usage_error");
    expect(run.stdout + run.stderr).not.toContain("do-not-print");
  });

  test("C-RC-09 an invalid manifest is manifest_invalid and installs none of its lines", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/gamma", "python-testing"]);
    addLocalSkill(project, "tools", "gamma");

    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(4);
    const payload = JSON.parse(run.stdout) as {
      error: { name: string; details: Record<string, unknown> };
    };
    expect(payload.error.name).toBe("manifest_invalid");
    expect(payload.error.details).toEqual({
      file: join(project, ".crewrc"),
      line: 2,
      ref: "python-testing",
    });
    expect(installed(home)).toEqual([]);
    expect(existsSync(join(project, ".claude"))).toBe(false);
  });

  test("C-RC-10 --scope user is a usage_error, while --scope project is accepted", () => {
    const home = makeCrewHome();
    const project = makeProject(["./tools/gamma"]);
    addLocalSkill(project, "tools", "gamma");

    const user = crew(home, project, ["install", "--scope", "user"]);
    expect(user.code).toBe(4);
    expect(user.stderr).toContain("--scope user");
    expect(installed(home)).toEqual([]);

    expect(crew(home, project, ["install", "--scope", "project"]).code).toBe(0);
    expect(installed(home)).toEqual([`gamma@${project}`]);
  });

  for (const flag of ["--recursive", "--tap", "--bundle", "--skill"]) {
    test(`C-RC-11 ${flag} reinterprets references, so it is a usage_error`, () => {
      const home = makeCrewHome();
      const project = makeProject(["./tools/gamma"]);
      addLocalSkill(project, "tools", "gamma");

      const run = crew(home, project, ["install", flag]);

      expect(run.code).toBe(4);
      expect(run.stderr).toContain(flag);
      expect(installed(home)).toEqual([]);
    });
  }

  test("C-RC-26 a path line that leaves the project through a symlink is manifest_invalid", () => {
    const home = makeCrewHome();
    const outside = makeTempDir("crew-outside-");
    addLocalSkill(outside, "", "stolen");
    const project = makeProject(["./tools/gamma", "./linked/stolen"]);
    addLocalSkill(project, "tools", "gamma");
    symlinkSync(outside, join(project, "linked"));

    const run = crew(home, project, ["install", "--json"]);

    expect(run.code).toBe(4);
    const { error } = JSON.parse(run.stdout) as {
      error: { name: string; details: Record<string, unknown> };
    };
    expect(error.name).toBe("manifest_invalid");
    expect(error.details).toEqual({
      file: join(project, ".crewrc"),
      line: 2,
      ref: "./linked/stolen",
    });
    expect(installed(home)).toEqual([]);
  });

  test("C-RC-12 references on the command line ignore the manifest entirely", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    writeManifest(project, ["python-testing"]);
    addLocalSkill(project, "tools", "gamma");

    expect(crew(home, project, ["install", "./tools/gamma"]).code).toBe(0);

    expect(installed(home)).toEqual(["gamma@user"]);
    expect(existsSync(join(redirected.userRoot, "gamma", "SKILL.md"))).toBe(true);
  });
});
