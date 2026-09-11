/**
 * E2E tests for collection selectors on `crew update` (PRD §10.1,
 * C-UPD-26..30): a positional may name a tap or a namespace and the
 * command updates everything installed from it.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { tapPath } from "../../src/core/paths.ts";
import { runGit } from "../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let ccRoot = "";
let restore: () => void;
beforeEach(() => {
  const originals = { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  ccRoot = makeTempDir("upd-coll-cc-");
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.user;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
  };
});
afterEach(() => restore());

function run(home: string, args: string[]): { code: number; out: string; json: () => any } {
  const cap = captureStreams();
  const code = runCli(args, { home, streams: cap.streams });
  return { code, out: cap.stdout(), json: () => JSON.parse(cap.stdout()) };
}

/** Flat tap: `<repo>/<skill>/SKILL.md` per name. */
function buildFlatTap(prefix: string, names: readonly string[]): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  for (const name of names) makeSkill(repo, name, skillFrontmatter({ name }));
  commitAll(repo, "init");
  return repo;
}

/** Namespaced tap: `<repo>/skills/<ns>/<skill>/SKILL.md`. */
function buildNamespacedTap(prefix: string, layout: Record<string, readonly string[]>): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  mkdirSync(join(repo, "skills"));
  for (const [ns, names] of Object.entries(layout)) {
    mkdirSync(join(repo, "skills", ns));
    for (const name of names) makeSkill(join(repo, "skills", ns), name, skillFrontmatter({ name }));
  }
  commitAll(repo, "init");
  return repo;
}

function bump(repo: string, relSkillDir: string, name: string, body: string): void {
  makeSkill(join(repo, relSkillDir), name, skillFrontmatter({ name }), body);
  commitAll(repo, `bump ${name}`);
}

function installedBody(name: string): string {
  return readFileSync(join(ccRoot, name, "SKILL.md"), "utf8");
}

function freshHome(): string {
  const home = makeCrewHome();
  run(home, ["tap", "remove", "core", "--force"]);
  return home;
}

describe("crew update <tap>", () => {
  test("C-UPD-26 a tap name updates every entry from it and picks up new siblings", () => {
    const home = freshHome();
    const repo = buildFlatTap("upd-coll-tap-", ["alpha", "beta"]);
    expect(run(home, ["tap", "add", `file://${repo}`, "acme"]).code).toBe(0);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    bump(repo, "", "alpha", "v2");
    makeSkill(repo, "gamma", skillFrontmatter({ name: "gamma" }));
    commitAll(repo, "add gamma");

    const r = run(home, ["update", "acme"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Updating tap acme (2 skills)");
    expect(installedBody("alpha")).toContain("v2");
    expect(installedBody("gamma")).toContain("name: gamma");

    const j = run(home, ["update", "acme", "--json"]).json();
    expect(j.selectors).toEqual([{ raw: "acme", kind: "tap", name: "acme" }]);
  });

  test("C-UPD-29 a tap with nothing installed is fetched and reported, exit 0", () => {
    const home = freshHome();
    const repo = buildFlatTap("upd-coll-empty-", ["alpha"]);
    expect(run(home, ["tap", "add", `file://${repo}`, "quiet"]).code).toBe(0);
    const before = runGit(["rev-parse", "HEAD"], { cwd: tapPath("quiet", home) }).stdout.trim();
    bump(repo, "", "alpha", "v2");

    const r = run(home, ["update", "quiet"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("No skills installed from tap quiet");
    const after = runGit(["rev-parse", "HEAD"], { cwd: tapPath("quiet", home) }).stdout.trim();
    expect(after).not.toBe(before);
  });
});

describe("crew update <namespace>", () => {
  test("C-UPD-27 qualified and bare namespace selectors touch only that namespace", () => {
    const home = freshHome();
    const repo = buildNamespacedTap("upd-coll-ns-", { marketing: ["copy", "seo"], eng: ["lint"] });
    expect(run(home, ["tap", "add", `file://${repo}`, "acme"]).code).toBe(0);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    bump(repo, "skills/marketing", "copy", "copy-v2");
    bump(repo, "skills/eng", "lint", "lint-v2");

    const r = run(home, ["update", "acme/marketing"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Updating namespace marketing (2 skills)");
    expect(installedBody("copy")).toContain("copy-v2");
    expect(installedBody("lint")).not.toContain("lint-v2");

    const bare = run(home, ["update", "marketing", "--json"]).json();
    expect(bare.selectors).toEqual([{ raw: "marketing", kind: "namespace", name: "marketing" }]);
    expect(bare.rows.map((row: { name: string }) => row.name).sort()).toEqual(["copy", "seo"]);
    expect(installedBody("lint")).not.toContain("lint-v2");
  });

  test("C-UPD-28 a bare namespace present in two taps is ambiguous", () => {
    const home = freshHome();
    const a = buildNamespacedTap("upd-coll-amb-a-", { marketing: ["copy"] });
    const b = buildNamespacedTap("upd-coll-amb-b-", { marketing: ["seo"] });
    run(home, ["tap", "add", `file://${a}`, "tap-a"]);
    run(home, ["tap", "add", `file://${b}`, "tap-b"]);
    expect(run(home, ["install", "tap-a"]).code).toBe(0);
    expect(run(home, ["install", "tap-b"]).code).toBe(0);

    const r = run(home, ["update", "marketing", "--json"]);
    expect(r.code).toBe(4);
    const err = r.json().error;
    expect(err.name).toBe("ambiguous_reference");
    expect(err.details.candidates).toEqual(["tap-a/marketing", "tap-b/marketing"]);
  });

  test("C-UPD-28 a word that is both a tap and a namespace elsewhere is ambiguous", () => {
    const home = freshHome();
    const a = buildNamespacedTap("upd-coll-amb-c-", { marketing: ["copy"] });
    const b = buildFlatTap("upd-coll-amb-d-", ["other"]);
    run(home, ["tap", "add", `file://${a}`, "tap-a"]);
    run(home, ["tap", "add", `file://${b}`, "marketing"]);
    expect(run(home, ["install", "tap-a"]).code).toBe(0);

    const r = run(home, ["update", "marketing", "--json"]);
    expect(r.code).toBe(4);
    expect(r.json().error.details.candidates).toEqual(["marketing", "tap-a/marketing"]);
  });
});

describe("crew update selector precedence and errors", () => {
  test("C-UPD-28 an installed skill name wins over a same-named tap", () => {
    const home = freshHome();
    const skills = buildFlatTap("upd-coll-prec-a-", ["pdf"]);
    const other = buildFlatTap("upd-coll-prec-b-", ["other"]);
    run(home, ["tap", "add", `file://${skills}`, "docs"]);
    run(home, ["tap", "add", `file://${other}`, "pdf"]);
    expect(run(home, ["install", "docs/pdf"]).code).toBe(0);

    const j = run(home, ["update", "pdf", "--json"]).json();
    expect(j.selectors).toEqual([{ raw: "pdf", kind: "skill", name: "pdf" }]);
    expect(j.rows.map((row: { name: string }) => row.name)).toEqual(["pdf"]);
  });

  test("C-UPD-30 an unmatched selector names all three things it could have been", () => {
    const home = freshHome();
    const r = run(home, ["update", "nope", "--json"]);
    expect(r.code).toBe(4);
    const err = r.json().error;
    expect(err.name).toBe("unknown_skill");
    expect(err.message).toContain("isn't an installed skill, a tap, or a namespace");
  });
});
