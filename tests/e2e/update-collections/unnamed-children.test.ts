/**
 * A new tap child whose `name` crew can't read (§10.1.1 step 2,
 * C-UPD-18c): missing, invalid, or behind a `SKILL.md` link crew won't
 * follow. It fails, named by its location in the tap, instead of vanishing
 * from the run — in real and dry runs alike — while its valid siblings
 * install. An installed entry at that location is its own update's to
 * report, and a namespace selector reports only what it could have added.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildNamespacedTap, freshHome, installedBody, type RunResult, run } from "./helpers.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let ccRoot = "";
beforeEach(() => {
  ccRoot = makeTempDir("upd-unnamed-cc-");
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});

/** Each re-expansion row as `name:kind:code`, sorted. */
function reexpandRows(r: RunResult): string[] {
  return r
    .json()
    .tap_reexpand_rows.map((row) => `${row.name}:${row.kind}:${row.error?.code ?? ""}`)
    .sort();
}

/** A home with tap `acme` (namespaces `layout`) installed whole; the tap's repo. Throws if that fails. */
function installedAcme(home: string, layout: Record<string, readonly string[]>): string {
  const repo = buildNamespacedTap("upd-unnamed-", layout);
  run(home, ["tap", "add", `file://${repo}`, "acme"]);
  if (run(home, ["install", "acme"]).code !== 0) throw new Error("installing acme failed");
  return repo;
}

describe("crew update and new children it can't name", () => {
  test("C-UPD-18c each fails by its location, in a dry run too, while a valid sibling installs", () => {
    const home = freshHome();
    const repo = installedAcme(home, { eng: ["lint"] });
    const eng = join(repo, "skills", "eng");
    makeSkill(eng, "bad", skillFrontmatter({ name: "Bad_Name" }));
    makeSkill(eng, "nameless", "description: no name here");
    // A SKILL.md that is a link out of its own folder (§9 step 4).
    makeSkill(eng, "linked", "unused: true");
    const linked = join(eng, "linked", "SKILL.md");
    rmSync(linked);
    symlinkSync("../lint/SKILL.md", linked);
    makeSkill(eng, "fmt", skillFrontmatter({ name: "fmt" }));
    commitAll(repo, "add four");

    const failures = [
      "skills/eng/bad:tap_error:invalid_skill",
      "skills/eng/linked:tap_error:invalid_skill",
      "skills/eng/nameless:tap_error:invalid_skill",
    ];
    const dry = run(home, ["update", "--dry-run", "--json"]);
    expect(dry.code).toBe(1);
    expect(reexpandRows(dry)).toEqual(["fmt:would_add:", ...failures]);

    const real = run(home, ["update", "--json"]);
    expect(real.code).toBe(1);
    expect(reexpandRows(real)).toEqual(["fmt:added:", ...failures]);
    const bad = real.json().tap_reexpand_rows.find((row) => row.name === "skills/eng/bad")!;
    expect(bad.error?.message).toContain("name");
    expect(installedBody(ccRoot, "fmt")).toContain("name: fmt");
    expect(() => installedBody(ccRoot, "bad")).toThrow();

    // The human output names each and counts it among the failures.
    const human = run(home, ["update"]);
    expect(human.code).toBe(1);
    expect(human.out).toContain("skills/eng/nameless");
    expect(human.out).toContain("3 failures");
  });

  test("C-UPD-18c an installed entry whose name breaks is its own update's to report", () => {
    const home = freshHome();
    const repo = installedAcme(home, { eng: ["lint"] });
    makeSkill(join(repo, "skills", "eng"), "lint", skillFrontmatter({ name: "Lint_Now" }));
    commitAll(repo, "break lint");

    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    expect(reexpandRows(r)).toEqual([]);
    const lint = r.json().rows.find((row) => row.name === "lint")!;
    expect(lint.outcome.kind).toBe("failed");
  });

  test("C-UPD-18c a namespace selector reports no child outside the namespace", () => {
    const home = freshHome();
    const repo = installedAcme(home, { marketing: ["copy"], eng: ["lint"] });
    makeSkill(join(repo, "skills", "eng"), "bad", skillFrontmatter({ name: "Bad_Name" }));
    commitAll(repo, "add bad");

    const other = run(home, ["update", "acme/marketing", "--json"]);
    expect(other.code).toBe(0);
    expect(reexpandRows(other)).toEqual([]);
    const own = run(home, ["update", "acme/eng", "--json"]);
    expect(own.code).toBe(1);
    expect(reexpandRows(own)).toEqual(["skills/eng/bad:tap_error:invalid_skill"]);
  });
});
