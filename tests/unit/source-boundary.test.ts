/**
 * Which folders lead out of a git source (§9 step 5 "Folder links";
 * C-SPEC-17), where the answer can't depend on the disk: `.git` is
 * matched in any case, since on a disk that folds case `.GIT` is crew's
 * clone metadata. A real `.GIT` folder stands in for it on every disk, so
 * this runs the same on case-sensitive Linux and case-folding macOS.
 * Install-level cases: `tests/e2e/install/folder-links/`.
 */

import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { leadsOutOfSource, repositoryBoundary } from "../../src/sources/source-boundary.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

test("C-SPEC-17 a folder linked to `.GIT` leads into `.git`, in any case", () => {
  const repo = makeTempDir("crew-boundary-");
  mkdirSync(join(repo, ".GIT"));
  mkdirSync(join(repo, "skills", "real"), { recursive: true });
  symlinkSync(join("..", ".GIT"), join(repo, "skills", "meta"));
  const boundary = repositoryBoundary(repo);
  expect(leadsOutOfSource(boundary, join(repo, "skills", "meta"))).toBe(true);
  expect(leadsOutOfSource(boundary, join(repo, "skills", "real"))).toBe(false);
});
