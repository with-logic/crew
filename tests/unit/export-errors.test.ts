/**
 * Failure classification for commit-tree export (§9 step 3, §13).
 *
 * Two failures look alike at the subprocess boundary and must not be
 * reported alike: a subpath genuinely absent at the requested commit is
 * a reference the user can fix, while an unreadable object or an
 * unwritable scratch directory means crew never materialized the source
 * at all and can conclude nothing about its contents.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { runGit } from "../../src/git/exec.ts";
import { exportTreeAt } from "../../src/git/export.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

/** A one-commit repo with a single `demo/` skill. */
function repoWithDemo(): { repo: string; sha: string } {
  const repo = makeTempDir("crew-exporterr-");
  makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
  makeGitRepo(repo, "one");
  const sha = runGit(["rev-parse", "HEAD"], { cwd: repo }).stdout.trim();
  return { repo, sha };
}

describe("exportTreeAt failure classification", () => {
  test("C-INST-05h a subpath absent at the commit is no_skills_found", () => {
    const { repo, sha } = repoWithDemo();
    const dest = join(makeTempDir("crew-exportdest-"), "out");

    let caught: unknown;
    try {
      exportTreeAt(repo, sha, "nosuchdir", dest);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(CrewError);
    expect((caught as CrewError).code).toBe("no_skills_found");
  });

  test("C-INST-05h an unreadable commit is source_unreachable, not a missing subpath", () => {
    // A well-formed SHA that names no object: the reference itself is
    // fine, but the repository cannot produce the tree. Reporting this
    // as "that directory isn't there" would send the user looking for a
    // path problem they don't have.
    const { repo } = repoWithDemo();
    const dest = join(makeTempDir("crew-exportdest-"), "out");
    const absent = "0".repeat(40);

    let caught: unknown;
    try {
      exportTreeAt(repo, absent, "demo", dest);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(CrewError);
    expect((caught as CrewError).code).toBe("source_unreachable");
  });

  test("a successful export writes the requested subpath", () => {
    const { repo, sha } = repoWithDemo();
    const dest = join(makeTempDir("crew-exportdest-"), "out");
    mkdirSync(dest, { recursive: true });

    exportTreeAt(repo, sha, "demo", dest);

    expect(Bun.file(join(dest, "demo", "SKILL.md")).size).toBeGreaterThan(0);
  });
});
