/**
 * The sibling index (§9 step 6): a dependency's candidates come back in
 * the directory's walk order, whether an entry is named for it or only
 * declares its name, so a duplicate-sibling error lists them the same way
 * on every run. A filesystem's own listing order can't be chosen in an
 * e2e test, so the reader here supplies one.
 */

import { expect, test } from "bun:test";
import { makeSiblingScan, type SiblingReader } from "../../src/install/siblings/index.ts";

/** A reader over `entries` (in that walk order), each declaring `dep`. */
function readerOf(entries: readonly string[]): SiblingReader {
  return {
    list: () => entries,
    stem: (entry) => entry,
    readBoundary: () => null,
    readEntry: () => ({ skill: true, leadsOut: false, declared: "dep" }),
  };
}

test("a dependency's candidates keep the directory's walk order", () => {
  const dir = makeSiblingScan().indexDir("/siblings", readerOf(["other", "dep", "another"]));
  // `dep` is named for the dependency, yet listed where the walk found it.
  const candidates = dir.candidatesFor("dep");
  expect(candidates as readonly string[]).toEqual(["other", "dep", "another"]);
  expect(dir.entry(candidates[1]!)).toEqual({ skill: true, leadsOut: false, declared: "dep" });
});

test("forgetting a root drops what was read inside it, and only that", () => {
  const scan = makeSiblingScan();
  const listed: string[] = [];
  const indexed = (path: string): void => {
    scan.indexDir(path, {
      ...readerOf(["dep"]),
      list: () => {
        listed.push(path);
        return ["dep"];
      },
    });
  };
  const loads: string[] = [];
  const load = (path: string): void => {
    scan.loaded(path, () => {
      loads.push(path);
      return { path, frontmatter: { name: "dep", description: "D." } };
    });
  };
  // An export's root, a folder in it, and one beside it whose name only starts the same.
  for (const path of ["/exp-a", "/exp-a/skills", "/exp-ab/skills"]) indexed(path);
  load("/exp-a/skills/dep");
  scan.forget("/exp-a");
  for (const path of ["/exp-a", "/exp-a/skills", "/exp-ab/skills"]) indexed(path);
  load("/exp-a/skills/dep");
  expect(listed).toEqual(["/exp-a", "/exp-a/skills", "/exp-ab/skills", "/exp-a", "/exp-a/skills"]);
  expect(loads).toEqual(["/exp-a/skills/dep", "/exp-a/skills/dep"]);
});

test("a directory is indexed once per scan", () => {
  const scan = makeSiblingScan();
  let lists = 0;
  const reader = {
    ...readerOf(["dep"]),
    list: () => {
      lists++;
      return ["dep"];
    },
  };
  scan.indexDir("/siblings", reader);
  scan.indexDir("/siblings", reader);
  expect(lists).toBe(1);
});
