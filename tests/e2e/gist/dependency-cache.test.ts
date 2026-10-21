/** Sibling indexes and commit exports are shared for an install-set walk (§9; C-GIST-06). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { resetGitRunner, setGitRunner } from "../../../src/git/exec.ts";
import { resolveInstallSet } from "../../../src/install/resolve/index.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll } from "../../helpers/fixtures.ts";
import { GIST_URL, gistFile, makeGist } from "./helpers.ts";

afterEach(() => resetGitRunner());

function tapHome(): { home: string; code: number } {
  const home = makeCrewHome();
  const { streams } = captureStreams();
  return { home, code: runCli(["tap", "add", GIST_URL, "snippets"], { home, streams }) };
}

function captureExports(): string[] {
  const exports: string[] = [];
  const previous = setGitRunner((args, options) => {
    const worktree = args.find((arg) => arg.startsWith("--work-tree="));
    if (worktree !== undefined) exports.push(worktree.slice("--work-tree=".length));
    return previous(args, options);
  });
  return exports;
}

test("C-GIST-06 many dependency-bearing parents share one captured sibling export", () => {
  const files: Record<string, string> = { dependency: gistFile("dep") };
  for (let i = 0; i < 12; i++) files[`parent-${i}`] = gistFile(`parent-${i}`, "", ["dep"]);
  const { sha } = makeGist(files);
  const { home, code } = tapHome();
  expect(code).toBe(0);
  const exports = captureExports();
  const result = resolveInstallSet([`snippets@${sha}`], readConfig(home), { home });
  expect(result.skills).toHaveLength(13);
  expect(result.requiredBy.get("dep")?.size).toBe(12);
  // One root expansion plus one sibling tree, independent of the parent count.
  expect(exports).toHaveLength(2);
  for (const path of exports) expect(existsSync(path)).toBe(false);
  const next = resolveInstallSet([`snippets@${sha}`], readConfig(home), { home });
  expect(next.skills).toHaveLength(13);
  // A subsequent invocation reacquires its own roots rather than retaining deleted paths.
  expect(exports).toHaveLength(4);
  for (const path of exports) expect(existsSync(path)).toBe(false);
});

test("C-GIST-06 different captured revisions retain separate sibling roots", () => {
  const oldBytes = gistFile("old-dep", "old bytes");
  const { repo, sha } = makeGist({
    first: gistFile("first", "", ["old-dep"]),
    dependency: oldBytes,
  });
  writeFileSync(join(repo, "second"), gistFile("second", "", ["new-dep"]));
  writeFileSync(join(repo, "dependency"), gistFile("new-dep", "new bytes"));
  const head = commitAll(repo, "change sibling name and add another parent");
  const { home, code } = tapHome();
  expect(code).toBe(0);
  const exports = captureExports();
  const result = resolveInstallSet(
    [`snippets/first@${sha}`, `snippets/second@${head}`],
    readConfig(home),
    { home },
  );
  expect(result.skills.map((skill) => skill.name).sort()).toEqual([
    "first",
    "new-dep",
    "old-dep",
    "second",
  ]);
  expect(result.skills.find((skill) => skill.name === "old-dep")?.resolvedSha).toBe(sha);
  expect(result.skills.find((skill) => skill.name === "new-dep")?.resolvedSha).toBe(head);
  // Each selected root has resolution and expansion exports, plus one sibling export per SHA.
  expect(exports).toHaveLength(6);
  for (const path of exports) expect(existsSync(path)).toBe(false);
});

test("C-GIST-06 a dependency failure releases every retained captured sibling root", () => {
  const { repo, sha } = makeGist({
    first: gistFile("first", "", ["old-dep"]),
    dependency: gistFile("old-dep"),
  });
  writeFileSync(join(repo, "second"), gistFile("second", "", ["new-dep"]));
  writeFileSync(join(repo, "one"), gistFile("new-dep"));
  writeFileSync(join(repo, "two"), gistFile("new-dep"));
  const head = commitAll(repo, "add a duplicate dependency at a different revision");
  const { home, code } = tapHome();
  expect(code).toBe(0);
  const exports = captureExports();
  expect(() =>
    resolveInstallSet([`snippets/first@${sha}`, `snippets/second@${head}`], readConfig(home), {
      home,
    }),
  ).toThrow(/appears multiple times/);
  expect(exports).toHaveLength(6);
  for (const path of exports) expect(existsSync(path)).toBe(false);
});

test("C-GIST-06 cleanup attempts every retained root when removing an earlier root fails", () => {
  const { repo, sha } = makeGist({
    first: gistFile("first", "", ["old-dep"]),
    dependency: gistFile("old-dep"),
  });
  writeFileSync(join(repo, "second"), gistFile("second", "", ["new-dep"]));
  writeFileSync(join(repo, "dependency"), gistFile("new-dep"));
  const head = commitAll(repo, "add a second dependency-bearing revision");
  const { home, code } = tapHome();
  expect(code).toBe(0);
  const exports = captureExports();
  const previous = setGitRunner((args, options) => {
    const result = previous(args, options);
    if (exports.length === 6 && args.some((arg) => arg.startsWith("--work-tree=")))
      chmodSync(exports[4]!, 0o500);
    return result;
  });
  try {
    expect(() =>
      resolveInstallSet([`snippets/first@${sha}`, `snippets/second@${head}`], readConfig(home), {
        home,
      }),
    ).toThrow(/EACCES|EPERM/);
    expect(exports).toHaveLength(6);
    expect(existsSync(exports[4]!)).toBe(true);
    expect(existsSync(exports[5]!)).toBe(false);
  } finally {
    chmodSync(exports[4]!, 0o700);
    rmSync(exports[4]!, { recursive: true, force: true });
  }
});
