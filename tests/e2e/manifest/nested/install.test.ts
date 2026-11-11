/**
 * A bare `crew install` in a repository with several projects (§9.2):
 * every manifest at or beneath the governing one is applied, each as its
 * own project.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../../helpers/env.ts";
import { makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, installed, makeSkillRepo, ownedNames, skillDir, writeManifest } from "../helpers.ts";
import { makeMonorepo } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

interface NestedResult {
  manifest_path?: string;
  records: { name: string }[];
  nested: { manifest_path: string; records: { name: string }[] }[];
}

describe("bare crew install with several manifests", () => {
  test("C-RC-58 at the root it installs every project, each into its own directory", () => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const beta = makeSkillRepo(["beta"]);
    const gamma = makeSkillRepo(["gamma"]);
    const root = makeMonorepo({
      ".": [alpha],
      "packages/api": [beta],
      "packages/web": [gamma],
    });
    const api = join(root, "packages/api");
    const web = join(root, "packages/web");

    const run = crew(home, root, ["install", "--json"]);

    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as NestedResult;
    expect(result.manifest_path).toBe(join(root, ".crewrc"));
    expect(result.records.map((record) => record.name)).toEqual(["alpha"]);
    expect(result.nested.map((project) => project.manifest_path)).toEqual([
      join(api, ".crewrc"),
      join(web, ".crewrc"),
    ]);
    expect(result.nested.map((project) => project.records[0]?.name)).toEqual(["beta", "gamma"]);
    expect(installed(home)).toEqual([`alpha@${root}`, `beta@${api}`, `gamma@${web}`].sort());
    expect(ownedNames(home)).toEqual(["alpha", "beta", "gamma"]);
    expect(existsSync(join(skillDir(api, "beta"), "SKILL.md"))).toBe(true);
    expect(existsSync(skillDir(root, "beta"))).toBe(false);
    expect(readFileSync(join(root, ".crewrc.lock"), "utf8")).toContain(alpha);
    expect(readFileSync(join(api, ".crewrc.lock"), "utf8")).toContain(beta);
    expect(readFileSync(join(web, ".crewrc.lock"), "utf8")).toContain(gamma);
  });

  test("C-RC-58 human output reports each project under its manifest's path", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
    });

    const run = crew(home, root, ["install"]);

    expect(run.code).toBe(0);
    const rootAt = run.stdout.indexOf(join(root, ".crewrc"));
    const apiAt = run.stdout.indexOf(join(root, "packages/api", ".crewrc"));
    const alphaAt = run.stdout.indexOf("alpha");
    expect(rootAt).toBeGreaterThanOrEqual(0);
    expect(alphaAt).toBeGreaterThan(rootAt);
    expect(apiAt).toBeGreaterThan(alphaAt);
    expect(run.stdout.indexOf("beta")).toBeGreaterThan(apiAt);
  });

  test("C-RC-58 with no manifest at the root, the projects beneath it are still installed", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({ "packages/api": [makeSkillRepo(["beta"])] });

    const run = crew(home, root, ["install", "--json"]);

    expect(run.code).toBe(0);
    const { nested, ...top } = JSON.parse(run.stdout) as NestedResult;
    expect(top as Record<string, unknown>).toEqual({
      already_installed: [],
      records: [],
      skipped: [],
      dry_run: false,
      removed: [],
    });
    expect(nested.map((project) => project.manifest_path)).toEqual([
      join(root, "packages/api", ".crewrc"),
    ]);
    expect(installed(home)).toEqual([`beta@${join(root, "packages/api")}`]);
  });

  test("C-RC-58 --dry-run applies to every project: each reports it and nothing is written", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
    });
    const api = join(root, "packages/api");

    const run = crew(home, root, ["install", "--dry-run", "--json"]);

    expect(run.code).toBe(0);
    const result = JSON.parse(run.stdout) as { dry_run: boolean; nested: { dry_run: boolean }[] };
    expect(result.dry_run).toBe(true);
    expect(result.nested.map((project) => project.dry_run)).toEqual([true]);
    expect(existsSync(skillDir(root, "alpha"))).toBe(false);
    expect(existsSync(skillDir(api, "beta"))).toBe(false);
    expect(existsSync(join(root, ".crewrc.lock"))).toBe(false);
    expect(existsSync(join(api, ".crewrc.lock"))).toBe(false);
    expect(existsSync(join(home, "state.json"))).toBe(false);
  });

  test("C-RC-59 run inside one project, it leaves its siblings and its parent alone", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "packages/api": [makeSkillRepo(["beta"])],
      "packages/web": [makeSkillRepo(["gamma"])],
      "packages/web/widgets": [makeSkillRepo(["delta"])],
    });
    const web = join(root, "packages/web");

    const run = crew(home, web, ["install"]);

    expect(run.code).toBe(0);
    expect(installed(home)).toEqual([`delta@${join(web, "widgets")}`, `gamma@${web}`]);
  });

  test("C-RC-59 a manifest git ignores, and one outside any repository, are not picked up", () => {
    const home = makeCrewHome();
    const root = makeMonorepo({
      ".": [makeSkillRepo(["alpha"])],
      "node_modules/pkg": [makeSkillRepo(["beta"])],
    });
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    expect(crew(home, root, ["install"]).code).toBe(0);
    expect(installed(home)).toEqual([`alpha@${root}`]);

    const plain = makeTempDir("crew-plain-");
    writeManifest(plain, [makeSkillRepo(["gamma"])]);
    const inner = join(plain, "inner");
    mkdirSync(inner);
    writeManifest(inner, [makeSkillRepo(["delta"])]);
    const run = crew(home, plain, ["install", "--json"]);
    expect(run.code).toBe(0);
    expect((JSON.parse(run.stdout) as Partial<NestedResult>).nested).toBeUndefined();
    expect(existsSync(skillDir(inner, "delta"))).toBe(false);
  });
});
