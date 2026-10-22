/** Captured directory trees have bounded invocation-owned lifetimes (§9 steps 3, 6). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resetGitRunner } from "../../../../src/git/exec.ts";
import { withDependencyTrees } from "../../../../src/install/resolve/dep/context.ts";
import { resolveInstallSet } from "../../../../src/install/resolve/index.ts";
import { captureExports, revisionParents, revisions } from "./helpers.ts";

afterEach(() => resetGitRunner());

test("C-INST-05f resolving four captured revisions retains at most two exports", () => {
  const { home, shas, config, url } = revisions();
  const { roots, alive } = captureExports();
  const result = resolveInstallSet(
    shas.map((sha, i) => `${url}@${sha}//parent-${i}`),
    config,
    { home },
  );
  for (const [i, sha] of shas.entries()) {
    const dep = result.skills.find((skill) => skill.name === `dep-${i}`)!;
    expect(dep.resolvedSha).toBe(sha);
    expect(dep.ref).toBe(sha);
    expect(readFileSync(join(dep.storePath, "SKILL.md"), "utf8")).toEndWith(`revision ${i}\n`);
  }
  expect(roots).toHaveLength(8);
  expect(Math.max(...alive)).toBe(2);
  for (const root of roots) expect(existsSync(root)).toBe(false);
});

test("C-INST-05f an evicted revision can be revisited with its original bytes", () => {
  const fixture = revisions();
  const parents = revisionParents(fixture);
  const { roots, alive } = captureExports();
  withDependencyTrees(fixture.home, (trees) => {
    for (const i of [0, 1, 2, 0]) {
      const parentPath = trees.parentPath(parents[i]!)!;
      expect(readFileSync(join(parentPath, "..", "dependency", "SKILL.md"), "utf8")).toEndWith(
        `revision ${i}\n`,
      );
      if (roots.length >= 3) expect(existsSync(roots[roots.length - 3]!)).toBe(false);
    }
  });
  expect(roots).toHaveLength(4);
  expect(Math.max(...alive)).toBe(2);
  for (const root of roots) expect(existsSync(root)).toBe(false);
});

test("C-INST-05f interleaved hits retain the most recently used captured revision", () => {
  const fixture = revisions();
  const parents = revisionParents(fixture);
  const { roots, alive } = captureExports();
  withDependencyTrees(fixture.home, (trees) => {
    const first = trees.parentPath(parents[0]!);
    trees.parentPath(parents[1]!);
    expect(trees.parentPath(parents[0]!)).toBe(first);
    trees.parentPath(parents[2]!);
    expect(existsSync(roots[1]!)).toBe(false);
    expect(trees.parentPath(parents[0]!)).toBe(first);
    expect(readFileSync(join(first!, "..", "dependency", "SKILL.md"), "utf8")).toEndWith(
      "revision 0\n",
    );
  });
  expect(roots).toHaveLength(3);
  expect(Math.max(...alive)).toBe(2);
  for (const root of roots) expect(existsSync(root)).toBe(false);
});

test("C-INST-05f a removed retained export is recreated at its captured revision", () => {
  const fixture = revisions();
  const parents = revisionParents(fixture);
  const { roots, alive } = captureExports();
  expect(
    readFileSync(join(fixture.url.slice("file://".length), "dependency", "SKILL.md"), "utf8"),
  ).toEndWith("revision 3\n");
  withDependencyTrees(fixture.home, (trees) => {
    trees.parentPath(parents[0]!);
    trees.parentPath(parents[1]!);
    rmSync(roots[0]!, { recursive: true });
    const parentPath = trees.parentPath(parents[0]!)!;
    expect(readFileSync(join(parentPath, "..", "dependency", "SKILL.md"), "utf8")).toEndWith(
      "revision 0\n",
    );
    expect(trees.parentPath(parents[0]!)).toBe(parentPath);
  });
  expect(roots).toHaveLength(3);
  expect(Math.max(...alive)).toBe(2);
  for (const root of roots) expect(existsSync(root)).toBe(false);
});

test("throwing from a dependency walk cleans every retained export", () => {
  const fixture = revisions();
  const parents = revisionParents(fixture);
  const { roots } = captureExports();
  const failure = new Error("stop the dependency walk");
  expect(() =>
    withDependencyTrees(fixture.home, (trees) => {
      trees.parentPath(parents[0]!);
      trees.parentPath(parents[1]!);
      throw failure;
    }),
  ).toThrow(failure);
  expect(roots).toHaveLength(2);
  for (const root of roots) expect(existsSync(root)).toBe(false);
});

test("failed eviction still attempts final cleanup of every retained export", () => {
  const fixture = revisions();
  const parents = revisionParents(fixture);
  const { roots } = captureExports();
  try {
    expect(() =>
      withDependencyTrees(fixture.home, (trees) => {
        trees.parentPath(parents[0]!);
        trees.parentPath(parents[1]!);
        chmodSync(roots[0]!, 0o500);
        trees.parentPath(parents[2]!);
      }),
    ).toThrow(/EACCES|EPERM|ENOTEMPTY/);
    expect(roots).toHaveLength(2);
    expect(existsSync(roots[0]!)).toBe(true);
    expect(existsSync(roots[1]!)).toBe(false);
  } finally {
    chmodSync(roots[0]!, 0o700);
    rmSync(roots[0]!, { recursive: true, force: true });
  }
});

test("failed eviction keeps its export owned for final cleanup", () => {
  const fixture = revisions();
  const parents = revisionParents(fixture);
  const { roots } = captureExports();
  try {
    expect(() =>
      withDependencyTrees(fixture.home, (trees) => {
        trees.parentPath(parents[0]!);
        trees.parentPath(parents[1]!);
        chmodSync(roots[0]!, 0o500);
        try {
          trees.parentPath(parents[2]!);
        } catch (err) {
          chmodSync(roots[0]!, 0o700);
          throw err;
        }
      }),
    ).toThrow(/EACCES|EPERM|ENOTEMPTY/);
    expect(roots).toHaveLength(2);
    for (const root of roots) expect(existsSync(root)).toBe(false);
  } finally {
    for (const root of roots) {
      if (existsSync(root)) chmodSync(root, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  }
});
