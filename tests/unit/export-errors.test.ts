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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { paths } from "../../src/core/paths.ts";
import { runGit } from "../../src/git/exec.ts";
import { createExportedTree, exportTreeAt, withExportedTree } from "../../src/git/export.ts";
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

  test("C-INST-05h an uncreatable scratch directory is source_unreachable", () => {
    // Nothing was materialized, so the failure says so rather than
    // escaping untranslated and surfacing as `usage_error` (§13).
    const { repo, sha } = repoWithDemo();
    const home = makeTempDir("crew-exporthome-");
    // `cache` as a FILE makes `cache/git` uncreatable.
    writeFileSync(join(home, "cache"), "not a dir\n");

    let caught: unknown;
    try {
      withExportedTree(repo, sha, "demo", home, () => null);
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

test("C-INST-05h a failed captured export removes its scratch directory and index", () => {
  const { repo, sha } = repoWithDemo();
  const home = makeTempDir("crew-exporthome-");
  let caught: unknown;
  try {
    createExportedTree({ clonePath: repo, sha, subpath: "nosuchdir", home });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(CrewError);
  expect((caught as CrewError).code).toBe("no_skills_found");
  expect(readdirSync(paths(home).gitCacheDir)).toEqual([]);
});

test("C-INST-05d export preserves a source-authored scratch-index filename", () => {
  const repo = makeTempDir("crew-export-index-source-");
  writeFileSync(join(repo, ".crew-export-index"), "source bytes\n");
  const { sha } = makeGitRepo(repo);
  const dest = join(makeTempDir("crew-export-index-dest-"), "out");
  exportTreeAt(repo, sha, "", dest);
  expect(readFileSync(join(dest, ".crew-export-index"), "utf8")).toBe("source bytes\n");
});

test("unexpected native spawn failures survive direct and captured export cleanup", () => {
  const home = makeTempDir("crew-export-spawn-home-");
  const clonePath = join(makeTempDir("crew-export-spawn-clone-"), "missing");
  const sha = "0".repeat(40);
  for (const captured of [false, true]) {
    const dest = join(makeTempDir("crew-export-spawn-dest-"), "out");
    let caught: unknown;
    try {
      if (captured) createExportedTree({ clonePath, sha, subpath: "", home });
      else exportTreeAt(clonePath, sha, "", dest);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(TypeError);
    const error = caught as NodeJS.ErrnoException;
    expect(error.code).toBe("ENOENT");
    expect(error.path).toBe("git");
    expect(error.syscall).toMatch(/spawn/);
    expect(error.message).toContain("ENOENT");
    if (captured) expect(readdirSync(paths(home).gitCacheDir)).toEqual([]);
    else {
      expect(existsSync(dest)).toBe(true);
      expect(existsSync(`${dest}.crew-export-index`)).toBe(false);
    }
  }
});
