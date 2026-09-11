/**
 * `crew install --from-git <value>` (§5.3, C-INST-02b).
 *
 * The flag forces a git interpretation of its value. Real local git
 * repos exposed as `file://` URLs exercise the install path; the
 * `owner/repo` → GitHub rewrite is asserted through the parser so no
 * test touches the network.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { normalizeFromGit } from "../../src/commands/install/from-git.ts";
import { parseRef } from "../../src/refs/parse.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let restore: (() => void) | null = null;
let ccRoot = "";

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  const originals = { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.d;
  };
});
afterEach(() => {
  restore?.();
  restore = null;
});

function makeRepoWithSkill(name: string): { repo: string; sha: string } {
  const repo = makeTempDir("crew-fg-");
  makeGitRepo(repo);
  makeSkill(repo, name, skillFrontmatter({ name }));
  const sha = commitAll(repo, `add ${name}`);
  return { repo, sha };
}

describe("crew install --from-git", () => {
  test("C-INST-02b installs from a file:// URL given via --from-git", () => {
    const home = makeCrewHome();
    const { repo, sha } = makeRepoWithSkill("demo");
    const capture = captureStreams();
    const code = runCli(["install", "--from-git", `file://${repo}//demo`], {
      home,
      streams: capture.streams,
    });
    expect(code).toBe(0);
    expect(existsSync(join(ccRoot, "demo", "SKILL.md"))).toBe(true);
    expect(readState(home).installations[0]!.resolved_sha).toBe(sha);
  });

  test("C-INST-02b combines --from-git with a positional reference", () => {
    const home = makeCrewHome();
    const a = makeRepoWithSkill("alpha");
    const b = makeRepoWithSkill("beta");
    const code = runCli(["install", `file://${a.repo}//alpha`, "--from-git", `file://${b.repo}`], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const names = readState(home)
      .installations.map((e) => e.name)
      .sort();
    expect(names).toEqual(["alpha", "beta"]);
  });

  test("C-INST-02b a bare owner/repo value is treated as GitHub", () => {
    const normalized = normalizeFromGit("acme/skills", "/tmp");
    expect(normalized).toBe("@acme/skills");
    const source = parseRef(normalized);
    expect(source.type).toBe("git");
    if (source.type === "git") expect(source.url).toBe("https://github.com/acme/skills.git");
    // A ref tail survives the rewrite.
    const pinned = parseRef(normalizeFromGit("acme/skills@v1.2.0", "/tmp"));
    if (pinned.type === "git") expect(pinned.ref).toBe("v1.2.0");
  });

  test("C-INST-02b explicit git forms pass through unchanged", () => {
    expect(normalizeFromGit("gh:acme/skills", "/tmp")).toBe("gh:acme/skills");
    expect(normalizeFromGit("  git@github.com:acme/skills.git ", "/tmp")).toBe(
      "git@github.com:acme/skills.git",
    );
  });

  test("C-INST-02b a value that isn't a git source is invalid_ref", () => {
    const home = makeCrewHome();
    for (const bad of ["not-a-url", "./some/path", "a/b/c"]) {
      const capture = captureStreams();
      const code = runCli(["install", "--json", "--from-git", bad], {
        home,
        streams: capture.streams,
      });
      expect(code).toBe(4);
      const payload = JSON.parse(capture.stdout()) as { error: { name: string } };
      expect(payload.error.name).toBe("invalid_ref");
    }
  });

  test("C-INST-02b --from-git on another command is a usage_error", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    const code = runCli(["list", "--from-git", "acme/skills"], { home, streams: capture.streams });
    expect(code).toBe(4);
    expect(capture.stderr()).toContain("from-git");
  });
});
