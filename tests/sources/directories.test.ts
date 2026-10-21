/** Source directory boundaries preserve absence, symlinks, and operational diagnostics (§9, §13). */

import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { expandSkills } from "../../src/sources/expand.ts";
import {
  isSourceDirectory,
  listSourceDirectory,
  walkSourceDirectory,
} from "../../src/sources/read.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

for (const kind of ["missing", "not-directory", "loop"]) {
  test(`source discovery retains absent semantics for ${kind}`, () => {
    const root = makeTempDir();
    let path = join(root, "absent");
    if (kind === "not-directory") {
      writeFileSync(join(root, "file"), "bytes");
      path = join(root, "file", "child");
    }
    if (kind === "loop") symlinkSync(path, path);
    expect(isSourceDirectory(path)).toBe(false);
    expect(listSourceDirectory(path)).toEqual([]);
    expect(walkSourceDirectory(path, {})).toEqual([]);
    expect(() => expandSkills(path, { recursive: true })).toThrow(
      expect.objectContaining({ code: "no_skills_found" }),
    );
  });
}

test("directory checks preserve local links while git probes ignore them", () => {
  const root = makeTempDir();
  const directory = join(root, "directory");
  mkdirSync(directory);
  const link = join(root, "link");
  symlinkSync(directory, link);
  expect(isSourceDirectory(link)).toBe(true);
  expect(isSourceDirectory(link, false)).toBe(false);
  writeFileSync(join(root, "file"), "bytes");
  expect(isSourceDirectory(join(root, "file"))).toBe(false);
  chmodSync(directory, 0);
  try {
    expect(isSourceDirectory(link, false)).toBe(false);
    expect(() => isSourceDirectory(link)).toThrow(
      expect.objectContaining({
        code: "source_unreachable",
        details: { path: link },
        remedy: expect.stringContaining("source directory"),
      }),
    );
  } finally {
    chmodSync(directory, 0o755);
  }
});

test("source walker reports a nested listing failure at the failing path", () => {
  const root = makeTempDir();
  const blocked = join(root, "blocked");
  mkdirSync(blocked);
  chmodSync(blocked, 0o111);
  try {
    expect(() => walkSourceDirectory(root, {})).toThrow(
      expect.objectContaining({
        code: "source_unreachable",
        details: { path: blocked },
      }),
    );
  } finally {
    chmodSync(blocked, 0o755);
  }
});

test("source walker preserves a classified callback failure", () => {
  const root = makeTempDir();
  mkdirSync(join(root, "child"));
  const error = new CrewError("source_unreachable", "cannot inspect child");
  expect(() =>
    walkSourceDirectory(root, {
      shouldDescend: () => {
        throw error;
      },
    }),
  ).toThrow(error);
});

for (const callback of ["shouldDescend", "shouldEmit"] as const) {
  test(`source walker preserves a plain ${callback} callback error by identity`, () => {
    const root = makeTempDir();
    mkdirSync(join(root, "child"));
    const error = new Error("callback failed");
    let caught: unknown;
    try {
      walkSourceDirectory(root, {
        [callback]: () => {
          throw error;
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(error);
  });
}
