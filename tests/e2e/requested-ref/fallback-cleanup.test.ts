/** Requested-ref fallback preserves real export cleanup failures (§9 step 3, §13). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { paths } from "../../../src/core/paths.ts";
import type { TapConfig } from "../../../src/core/types.ts";
import { resetGitRunner, runGit, setGitRunner } from "../../../src/git/exec.ts";
import { withTapsAtRef } from "../../../src/sources/acquire/at-ref.ts";
import { readState } from "../../../src/state/load.ts";
import { hasExportCleanupFailure } from "../../../src/util/export-cleanup.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

let original: { userPath: () => string; detect: () => boolean };
let agentRoot = "";
beforeEach(() => {
  agentRoot = makeTempDir("crew-fallback-cleanup-agent-");
  original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
  resetGitRunner();
});

function fixture(missingRef = false) {
  const home = makeCrewHome();
  const first = makeTempDir("crew-fallback-first-");
  const second = makeTempDir("crew-fallback-second-");
  makeSkill(join(first, "skills"), "other", skillFrontmatter({ name: "other" }));
  makeSkill(second, "demo", skillFrontmatter({ name: "demo", description: "SECOND TAP" }));
  const { sha } = makeGitRepo(first);
  makeGitRepo(second);
  runGit(["-c", "tag.gpgSign=false", "tag", "requested"], { cwd: second });
  if (!missingRef) runGit(["-c", "tag.gpgSign=false", "tag", "requested"], { cwd: first });
  const taps: readonly TapConfig[] = [
    {
      name: "first",
      kind: "git",
      registered: true,
      url: `file://${first}`,
      subpath: "skills",
      path: "",
    },
    {
      name: "second",
      kind: "git",
      registered: true,
      url: `file://${second}`,
      subpath: "",
      path: "",
    },
  ];
  // Warm real clones before making the first tap's requested subpath unavailable.
  withTapsAtRef(taps, "requested", home, () => undefined);
  const unavailableFirst = [{ ...taps[0]!, subpath: "missing" }, taps[1]!];
  writeConfig({ ...readConfig(home), taps: unavailableFirst }, home);
  return { home, taps: unavailableFirst, sha };
}

for (const missingRef of [false, true]) {
  test(`C-INST-05e unavailable first tap permits healthy fallback (missingRef=${missingRef})`, () => {
    const { home } = fixture(missingRef);
    const output = captureStreams();
    expect(
      runCli(["install", "demo@requested", "--agent", "claude-code", "--json"], {
        home,
        streams: output.streams,
      }),
    ).toBe(0);
    expect(readFileSync(join(agentRoot, "demo", "SKILL.md"), "utf8")).toContain("SECOND TAP");
    expect(readState(home).installations[0]!.source.tap).toBe("second");
    expect(readdirSync(paths(home).gitCacheDir)).toEqual([]);
  }, 60_000);
}

test("C-INST-05d cleanup failure aborts requested-ref fallback and preserves primary diagnostics", () => {
  const { home, sha } = fixture();
  const state = readState(home);
  const hadStateFile = existsSync(paths(home).stateFile);
  const config = readFileSync(paths(home).configFile, "utf8");
  let index = "";
  let exported = "";
  let diagnostic = "";
  const previous = setGitRunner((args, options) => {
    const result = previous(args, options);
    const indexFile = options.env?.["GIT_INDEX_FILE"];
    if (
      index === "" &&
      indexFile &&
      result.exitCode !== 0 &&
      result.stderr.includes("did not match any file")
    ) {
      index = indexFile;
      exported = index.slice(0, -".crew-export-index".length);
      diagnostic = result.stderr.trim();
      // Deny real removal inside each owned scratch path, leaving the common cache writable.
      mkdirSync(index);
      writeFileSync(join(index, "retained-index"), "retained scratch index");
      chmodSync(index, 0o500);
      writeFileSync(join(exported, "partial-export"), "retained export");
      chmodSync(exported, 0o500);
    }
    return result;
  });
  const output = captureStreams();
  let exit: number;
  try {
    exit = runCli(["install", "demo@requested", "--agent", "claude-code", "--json"], {
      home,
      streams: output.streams,
    });
  } finally {
    if (index) chmodSync(index, 0o700);
    if (exported) chmodSync(exported, 0o700);
  }
  expect(index).not.toBe("");
  expect(existsSync(index)).toBe(true);
  expect(existsSync(exported)).toBe(true);
  expect(exit).toBe(4);
  const payload = JSON.parse(output.stdout());
  expect(payload.error.name).toBe("no_skills_found");
  expect(payload.error.details).toEqual({ sha, subpath: "missing" });
  expect(payload.error.message).toContain(diagnostic);
  expect(payload.error.message).toContain(index);
  expect(payload.error.message).toContain(exported);
  expect(payload.error.message).toMatch(/EACCES|EPERM|ENOTEMPTY/);
  expect(existsSync(join(agentRoot, "demo"))).toBe(false);
  expect(readState(home)).toEqual(state);
  expect(existsSync(paths(home).stateFile)).toBe(hadStateFile);
  expect(readFileSync(paths(home).configFile, "utf8")).toBe(config);
});

test("inner callback error identity, details and remedy still propagate unchanged", () => {
  const { home, taps } = fixture();
  const primary = new CrewError(
    "invalid_skill",
    "callback stopped",
    { proof: "identity" },
    "keep remedy",
  );
  let caught: unknown;
  try {
    withTapsAtRef(taps, "requested", home, () => {
      throw primary;
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBe(primary);
  expect(primary.code).toBe("invalid_skill");
  expect(primary.details).toEqual({ proof: "identity" });
  expect(primary.remedy).toBe("keep remedy");
  expect(hasExportCleanupFailure(primary)).toBe(false);
  expect(readdirSync(paths(home).gitCacheDir)).toEqual([]);
});
