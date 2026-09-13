/**
 * Containment for subpaths that arrive from `config.yaml` rather than
 * from a reference (§8.4, C-REF-22a/22c).
 *
 * `normalizeSubpath` guards references as they are parsed, but a tap
 * row read back from disk never passes through it: a user can hand-edit
 * `config.yaml`, a subpath can become a symlink after `crew tap add`,
 * or a row can predate the guard. Install validated these through
 * `acquireTap`; `crew search` and `crew info` index taps by their own
 * path, so the check has to live where the stored subpath becomes a
 * real location.
 */

import { describe, expect, test } from "bun:test";
import { symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import { assertNoSymlinkEscape } from "../../src/util/symlink-containment.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

/** Write a config naming one git tap with the given subpath, verbatim. */
function writeTapConfig(home: string, url: string, subpath: string): void {
  const yaml = [
    "taps:",
    "  - name: edited",
    "    kind: git",
    "    registered: true",
    `    url: ${url}`,
    `    subpath: ${subpath}`,
    '    path: ""',
    "disabled_agents: []",
    "forced_agents: []",
    "autoupdate:",
    "  enabled: false",
    "  interval_seconds: 14400",
    "",
  ].join("\n");
  writeFileSync(paths(home).configFile, yaml);
}

describe("stored tap subpaths are contained", () => {
  test("C-REF-22a a hand-edited `..` subpath is skipped, not indexed", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-repo-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "init");
    // No symlink anywhere: this escapes lexically, so only a containment
    // check catches it.
    writeTapConfig(home, `file://${repo}`, "../../../etc");

    const capture = captureStreams();
    const code = runCli(["search", "demo"], { home, streams: capture.streams });

    // §16.6 keeps a bad tap a warning rather than a failure, but the
    // warning must say what is actually wrong — "retry when online"
    // would never fix an escaping subpath.
    expect(code).toBe(0);
    expect(capture.stderr()).toContain("outside the source");
    expect(capture.stderr()).not.toContain("back online");
  });

  test("C-REF-22c a subpath that became a symlink is skipped, not indexed", () => {
    const home = makeCrewHome();
    const outside = makeTempDir("crew-outside-");
    makeSkill(outside, "pwned", skillFrontmatter({ name: "pwned" }));
    const repo = makeTempDir("crew-repo-");
    makeGitRepo(repo);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    symlinkSync(outside, join(repo, "later"));
    commitAll(repo, "init");
    writeTapConfig(home, `file://${repo}`, "later");

    const capture = captureStreams();
    const code = runCli(["search", "pwned"], { home, streams: capture.streams });

    expect(code).toBe(0);
    expect(capture.stderr()).toContain("symlink");
    // The outside skill must not appear in results.
    expect(capture.stdout()).not.toContain("pwned  ");
  });
});

describe("absence is not a containment violation", () => {
  /**
   * Containment answers *where* a path points, not *whether* it
   * exists. A missing path points nowhere, and a missing segment
   * cannot be a symlink, so absence must pass the check and be
   * reported by the caller that cares — for a skill deleted upstream
   * that is §10.1's soft `source_gone` outcome, not a hard failure.
   *
   * These assert the helper directly rather than through a command,
   * because `crew search` converts indexing failures into warnings
   * (§16.6), which would swallow the difference and let a regression
   * pass unnoticed.
   */
  test("a missing but contained target is accepted", () => {
    const root = makeTempDir("crew-root-");
    expect(() => assertNoSymlinkEscape(root, join(root, "deleted"), "subject")).not.toThrow();
  });

  test("a missing target that escapes is still refused", () => {
    const root = makeTempDir("crew-root-");
    // Absence must not become a way around the lexical check.
    expect(() => assertNoSymlinkEscape(root, join(root, "..", "gone"), "subject")).toThrow(
      /outside the source/,
    );
  });

  test("an unreadable segment still fails rather than passing silently", () => {
    const root = makeTempDir("crew-root-");
    // A file where a directory belongs: `lstat` on the child fails with
    // ENOTDIR, not ENOENT. Only absence is absorbed — a segment we
    // cannot inspect must never be treated as contained.
    writeFileSync(join(root, "afile"), "x");
    expect(() => assertNoSymlinkEscape(root, join(root, "afile", "child"), "subject")).toThrow();
  });
});
