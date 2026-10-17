/**
 * The exports dependency resolution holds while reading siblings (§9 step
 * 6; C-INST-27): at most `MAX_HELD_EXPORTS` at once, the one read least
 * recently let go first — and named to `onRelease`, so whatever was read
 * from it goes too — and exported again when it is wanted later.
 */

import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import type { TapConfig } from "../../src/core/types.ts";
import { resetGitRunner, setGitRunner } from "../../src/git/exec.ts";
import { MAX_HELD_EXPORTS, makeParentTrees } from "../../src/install/resolve/dep/parent-tree.ts";
import { makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../helpers/fixtures.ts";

afterEach(() => resetGitRunner());

test("C-INST-27 the export read least recently is let go first, and read again on a later miss", () => {
  // One commit more than are held, each tagged.
  const repo = makeTempDir("crew-trees-");
  makeSkill(repo, "a", skillFrontmatter({ name: "a" }));
  const shas = [makeGitRepo(repo).sha];
  tagRepo(repo, "v1");
  for (let i = 2; i <= MAX_HELD_EXPORTS + 1; i++) {
    makeSkill(repo, "a", skillFrontmatter({ name: "a" }), `Version ${i}.\n`);
    shas.push(commitAll(repo, `v${i}`));
    tagRepo(repo, `v${i}`);
  }
  const tap: TapConfig = {
    name: "acme",
    kind: "git",
    registered: true,
    url: `file://${repo}`,
    subpath: "",
    path: "",
  };
  const parentAt = (i: number) => ({
    tap,
    tapRelativePath: "a",
    resolvedSha: shas[i]!,
    requestedRef: `v${i + 1}`,
  });

  const exported: string[] = [];
  const served = setGitRunner((args, options) => {
    if (args.some((a) => a.startsWith("--work-tree="))) {
      exported.push(args[args.indexOf("checkout") + 1]!);
    }
    return served(args, options);
  });
  const released: string[] = [];
  const trees = makeParentTrees(makeCrewHome(), (root) => released.push(root));

  const at = new Map<number, string>();
  for (let i = 0; i < MAX_HELD_EXPORTS; i++) at.set(i, trees.locate(parentAt(i))!);
  // Read again, the first is the most recent: the next new one lets the second go.
  expect(trees.locate(parentAt(0))).toBe(at.get(0)!);
  trees.locate(parentAt(MAX_HELD_EXPORTS));
  expect(released).toEqual([join(at.get(1)!, "..")]);
  // The first is still held; the second is exported again.
  expect(trees.locate(parentAt(0))).toBe(at.get(0)!);
  trees.locate(parentAt(1));
  expect(exported).toEqual([...shas, shas[1]!]);

  trees.release();
  expect(released).toHaveLength(MAX_HELD_EXPORTS + 2);
});
