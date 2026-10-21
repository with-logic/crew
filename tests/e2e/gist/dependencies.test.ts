/** Gist bare dependencies retain parent provenance and share exported trees (§9 step 6). */
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { resetGitRunner, runGit, setGitRunner } from "../../../src/git/exec.ts";
import { resolveInstallSet } from "../../../src/install/resolve/index.ts";
import { withGistDiscovery } from "../../../src/sources/gist.ts";
import { commitAll } from "../../helpers/fixtures.ts";
import { GIST_URL, gistFile, gistFixture } from "./helpers.ts";

afterEach(() => resetGitRunner());

test("C-GIST-05 no-ref parents keep captured bytes when a later root fetches", () => {
  const f = gistFixture();
  gistFile(f.repo, "prd.md", "prd", ["build"]);
  const captured = commitAll(f.repo, "parent depends on build");
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  const original = readFileSync(join(f.repo, "build.txt"), "utf8");
  let advanced = false;
  const exports: string[] = [];
  const previous = setGitRunner((args, options) => {
    if (!advanced && args.includes("refs/tags/later^{commit}")) {
      advanced = true;
      writeFileSync(join(f.repo, "build.txt"), `${original}future bytes\n`);
      gistFile(f.repo, "other.md", "other");
      commitAll(f.repo, "advance upstream during second root");
      runGit(["branch", "later"], { cwd: f.repo });
    }
    const result = previous(args, options);
    const tree = args.find((arg) => arg.startsWith("--work-tree="));
    if (tree) exports.push(tree.slice("--work-tree=".length));
    return result;
  });
  const result = withGistDiscovery(() =>
    resolveInstallSet(["snippets/prd", "snippets/other@later"], readConfig(f.home), {
      home: f.home,
    }),
  );
  expect(advanced).toBe(true);
  const dep = result.skills.find((skill) => skill.name === "build")!;
  expect(dep.resolvedSha).toBe(captured);
  expect(dep.ref).toBe(null);
  expect(readFileSync(join(dep.storePath, "SKILL.md"), "utf8")).toBe(original);
  // Existing ref resolution acquires two roots; bare deps add one captured tree.
  expect(exports).toHaveLength(3);
  for (const root of exports) expect(existsSync(root)).toBe(false);
});
test("C-GIST-05 same-commit dependency chain shares one captured export", () => {
  const f = gistFixture({ one: "one", two: "two", three: "three" });
  gistFile(f.repo, "one", "one", ["two"]);
  gistFile(f.repo, "two", "two", ["three"]);
  const sha = commitAll(f.repo, "chain");
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  const roots: string[] = [];
  const previous = setGitRunner((args, options) => {
    const result = previous(args, options);
    const tree = args.find((arg) => arg.startsWith("--work-tree="));
    if (tree) roots.push(tree.slice("--work-tree=".length));
    return result;
  });
  const result = withGistDiscovery(() =>
    resolveInstallSet(["snippets/one"], readConfig(f.home), { home: f.home }),
  );
  expect(result.skills.map((skill) => skill.name)).toEqual(["three", "two", "one"]);
  for (const skill of result.skills) expect(skill.resolvedSha).toBe(sha);
  expect(roots).toHaveLength(1);
  expect(existsSync(roots[0]!)).toBe(false);
});
