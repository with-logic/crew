/** Dependency failures keep their identity while every export cleanup runs (§9 steps 3, 6). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync } from "node:fs";
import { CrewError } from "../../../../src/core/errors.ts";
import { resetGitRunner } from "../../../../src/git/exec.ts";
import { withDependencyTrees } from "../../../../src/install/resolve/dep/context.ts";
import { captureExports, revisionParents, revisions } from "./helpers.ts";

afterEach(() => resetGitRunner());

for (const failures of [1, 2]) {
  test(`dependency CrewError survives ${failures} cleanup failures and attempts every export`, () => {
    const fixture = revisions();
    const parents = revisionParents(fixture);
    const { roots } = captureExports();
    const primary = new CrewError("conflicting_dependencies", "incompatible captured siblings", {
      name: "dependency",
    });
    let caught: unknown;
    try {
      withDependencyTrees(fixture.home, (trees) => {
        trees.parentPath(parents[0]!);
        trees.parentPath(parents[1]!);
        chmodSync(roots[0]!, 0o500);
        if (failures === 2) chmodSync(roots[1]!, 0o500);
        throw primary;
      });
    } catch (err) {
      caught = err;
    } finally {
      chmodSync(roots[0]!, 0o700);
      if (failures === 2) chmodSync(roots[1]!, 0o700);
    }
    expect(caught).toBe(primary);
    expect(primary.code).toBe("conflicting_dependencies");
    expect(primary.details).toEqual({ name: "dependency" });
    expect(primary.message).toContain(roots[0]!);
    expect(primary.message).toMatch(/EACCES|EPERM|ENOTEMPTY/);
    expect(existsSync(roots[0]!)).toBe(true);
    expect(existsSync(roots[1]!)).toBe(failures === 2);
    if (failures === 2) expect(primary.message).toContain(roots[1]!);
  });
}
