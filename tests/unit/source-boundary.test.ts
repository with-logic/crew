/**
 * Which folders lead out of a git source (§9 step 5 "Folder links";
 * C-SPEC-17), where the answer can't depend on the disk: `.git` is
 * matched in any case, since on a disk that folds case `.GIT` is crew's
 * clone metadata. A real `.GIT` folder stands in for it on every disk, so
 * this runs the same on case-sensitive Linux and case-folding macOS. A
 * folder crew can't place as the OS does — link text that isn't UTF-8, a
 * link it can't follow — isn't known to stay inside, so it leads out.
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

test("C-SPEC-17 a folder whose link text isn't UTF-8 leads out", () => {
  // Decoded lossily, `\xff` would be checked as U+FFFD: a real folder here.
  const repo = makeTempDir("crew-boundary-");
  mkdirSync(join(repo, "skills", "\uFFFD"), { recursive: true });
  symlinkSync(Buffer.from([0xff]), join(repo, "skills", "evil"));
  expect(leadsOutOfSource(repositoryBoundary(repo), join(repo, "skills", "evil"))).toBe(true);
});

test("C-SPEC-17 a folder crew can't follow to its end leads out", () => {
  const repo = makeTempDir("crew-boundary-");
  mkdirSync(join(repo, "skills"));
  symlinkSync("gone/deeper", join(repo, "skills", "lost"));
  expect(leadsOutOfSource(repositoryBoundary(repo), join(repo, "skills", "lost"))).toBe(true);
});
