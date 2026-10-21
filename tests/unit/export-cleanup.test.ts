/** Primary export failures survive real scratch cleanup failures (§9 step 3, §13). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { writeError } from "../../src/cli/output.ts";
import { CrewError } from "../../src/core/errors.ts";
import { paths } from "../../src/core/paths.ts";
import { resetGitRunner, setGitRunner } from "../../src/git/exec.ts";
import { createExportedTree, withExportedTree } from "../../src/git/export.ts";
import { hasExportCleanupFailure } from "../../src/util/export-cleanup.ts";
import { sanitizeLine } from "../../src/util/redact.ts";
import { makeStyler } from "../../src/util/term.ts";
import { captureStreams } from "../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

afterEach(() => resetGitRunner());

function fixture(homePrefix = "crew-export-cleanup-home-") {
  const repo = makeTempDir("crew-export-cleanup-repo-");
  makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
  const { sha } = makeGitRepo(repo);
  return { repo, sha, home: makeTempDir(homePrefix) };
}

test("callback CrewError identity, details and rendered diagnostics survive cleanup failure", () => {
  const { repo, sha, home } = fixture("crew-export-cleanup-home-\n");
  const primary = new CrewError("invalid_skill", "invalid captured skill", { skill: "demo" });
  const details = primary.details;
  let root = "";
  let caught: unknown;
  try {
    withExportedTree(repo, sha, "", home, (rootDir) => {
      root = rootDir;
      chmodSync(root, 0o500);
      throw primary;
    });
  } catch (err) {
    caught = err;
  } finally {
    if (root) chmodSync(root, 0o700);
  }
  expect(existsSync(root)).toBe(true);
  expect(caught).toBe(primary);
  expect(primary.code).toBe("invalid_skill");
  expect(primary.exitCode).toBe(4);
  expect(primary.details).toBe(details);
  expect(primary.details).toEqual({ skill: "demo" });
  expect(primary.message).toContain(sanitizeLine(root));
  expect(primary.message).not.toContain("\n");
  expect(primary.message).toMatch(/EACCES|EPERM/);
  for (const json of [false, true]) {
    const output = captureStreams();
    writeError(primary, json, output.streams, makeStyler(false));
    const rendered = json
      ? (JSON.parse(output.stdout()) as { error: { message: string } }).error.message
      : output.stderr();
    expect(rendered).toContain(sanitizeLine(root));
    expect(output.stdout() + output.stderr()).toContain("invalid_skill");
  }
});

test("primitive callback failure remains visible alongside failed cleanup", () => {
  const { repo, sha, home } = fixture();
  let root = "";
  let caught: unknown;
  try {
    withExportedTree(repo, sha, "", home, (rootDir) => {
      root = rootDir;
      chmodSync(root, 0o500);
      // biome-ignore lint/style/useThrowOnlyError: callbacks can throw primitives; preserve their diagnostic.
      throw "stop captured read";
    });
  } catch (err) {
    caught = err;
  } finally {
    if (root) chmodSync(root, 0o700);
  }
  expect(caught).toBeInstanceOf(CrewError);
  expect((caught as CrewError).code).toBe("usage_error");
  expect((caught as Error).message).toContain("stop captured read");
  expect((caught as Error).message).toContain(root);
});

test("cleanup failure after a successful callback still fails the operation", () => {
  const { repo, sha, home } = fixture();
  let root = "";
  try {
    expect(() =>
      withExportedTree(repo, sha, "", home, (rootDir) => {
        root = rootDir;
        chmodSync(root, 0o500);
        return "success";
      }),
    ).toThrow(/EACCES|EPERM/);
    expect(existsSync(root)).toBe(true);
  } finally {
    if (root) chmodSync(root, 0o700);
  }
});

test("real git classification survives scratch-index and export cleanup failures", () => {
  const { repo, sha, home } = fixture();
  const cache = paths(home).gitCacheDir;
  let index = "";
  let diagnostic = "";
  const previous = setGitRunner((args, options) => {
    const result = previous(args, options);
    index = options.env!["GIT_INDEX_FILE"]!;
    diagnostic = result.stderr.trim();
    writeFileSync(index, "retained scratch index");
    chmodSync(dirname(index), 0o500);
    return result;
  });
  let caught: unknown;
  try {
    createExportedTree({ clonePath: repo, sha, subpath: "missing", home });
  } catch (err) {
    caught = err;
  } finally {
    chmodSync(cache, 0o700);
  }
  expect(caught).toBeInstanceOf(CrewError);
  const error = caught as CrewError;
  expect(error.code).toBe("no_skills_found");
  expect(error.details).toEqual({ sha, subpath: "missing" });
  expect(error.message).toContain(diagnostic);
  expect(error.message).toContain(index);
  expect(error.message).toContain(index.slice(0, -".crew-export-index".length));
  expect(existsSync(index)).toBe(true);
  expect(existsSync(index.slice(0, -".crew-export-index".length))).toBe(true);
});

test("native spawn error identity survives real scratch-index and export cleanup failures", () => {
  const home = makeTempDir("crew-export-native-cleanup-home-");
  const clonePath = join(makeTempDir("crew-export-native-cleanup-clone-"), "missing");
  const cache = paths(home).gitCacheDir;
  let index = "";
  let root = "";
  let original: unknown;
  let nativeFields: {
    code: string | undefined;
    path: string | undefined;
    syscall: string | undefined;
  } = { code: undefined, path: undefined, syscall: undefined };
  const previous = setGitRunner((args, options) => {
    try {
      return previous(args, options);
    } catch (err) {
      original = err;
      const native = err as NodeJS.ErrnoException;
      nativeFields = { code: native.code, path: native.path, syscall: native.syscall };
      index = options.env!["GIT_INDEX_FILE"]!;
      root = index.slice(0, -".crew-export-index".length);
      writeFileSync(index, "retained native scratch index");
      writeFileSync(join(root, "owned"), "export bytes");
      chmodSync(root, 0o500);
      chmodSync(cache, 0o500);
      throw err;
    }
  });
  let caught: unknown;
  try {
    createExportedTree({ clonePath, sha: "0".repeat(40), subpath: "", home });
  } catch (err) {
    caught = err;
  } finally {
    chmodSync(cache, 0o700);
    if (root) chmodSync(root, 0o700);
  }
  expect(caught).toBe(original);
  expect(caught).not.toBeInstanceOf(TypeError);
  const error = caught as NodeJS.ErrnoException;
  expect({ code: error.code, path: error.path, syscall: error.syscall }).toEqual(nativeFields);
  expect(error.code).toBe("ENOENT");
  expect(error.path).toBe("git");
  expect(error.syscall).toMatch(/spawn/);
  expect(error.message).toContain("ENOENT");
  expect(error.message).toMatch(/EACCES|EPERM/);
  expect(hasExportCleanupFailure(error)).toBe(true);
  expect(error.message).toContain(index);
  expect(error.message).toContain(root);
  expect(readFileSync(index, "utf8")).toBe("retained native scratch index");
  expect(readFileSync(join(root, "owned"), "utf8")).toBe("export bytes");
});
