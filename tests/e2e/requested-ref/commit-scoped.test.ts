/**
 * Everything a ref-carrying reference reads must come from the resolved
 * commit — resolution, sibling dependencies, and the exported tree
 * itself (§9 step 3).
 *
 * These cover the cases where the requested commit and the clone's
 * `HEAD` genuinely disagree: a skill deleted upstream, a dependency
 * whose content changed, and a subpath that is a symlink out of the
 * tree.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { runGit } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { adapterRoot, tag, useRedirectedAdapter } from "./helpers.ts";

useRedirectedAdapter();

/** Repo where `gone/` exists at `v1` and is deleted at HEAD. */
function deletedAtHeadRepo(): string {
  const repo = makeTempDir("crew-gone-");
  makeSkill(repo, "gone", skillFrontmatter({ name: "gone", description: "ONLY AT V1" }));
  makeSkill(repo, "stays", skillFrontmatter({ name: "stays", description: "ALWAYS" }));
  makeGitRepo(repo, "one");
  tag(repo, "v1");
  runGit(["rm", "-rq", "gone"], { cwd: repo });
  commitAll(repo, "drop gone");
  return repo;
}

describe("C-INST-05e resolution reads the requested commit", () => {
  test("a tap-qualified ref installs a skill deleted at HEAD", () => {
    const home = makeCrewHome();
    const repo = deletedAtHeadRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });

    const c = captureStreams();
    const code = runCli(["install", "mytap/gone@v1"], { home, streams: c.streams });

    expect(code).toBe(0);
    expect(existsSync(join(adapterRoot(), "gone", "SKILL.md"))).toBe(true);
    expect(readState(home).installations[0]!.name).toBe("gone");
  });

  test("a bare name carrying a ref previews that commit", () => {
    // A bare name could live in any configured tap, so it resolves
    // against the clone and re-expands at the ref afterwards — the
    // other arm of the same guarantee.
    const home = makeCrewHome();
    const repo = makeTempDir("crew-solo-");
    makeSkill(repo, "solo", skillFrontmatter({ name: "solo", description: "SOLO AT V1" }));
    makeGitRepo(repo, "one");
    tag(repo, "v1");
    writeFileSync(
      join(repo, "solo", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "solo", description: "SOLO AT HEAD" })}\n---\n`,
    );
    commitAll(repo, "two");
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });

    const c = captureStreams();
    const code = runCli(["info", "solo@v1"], { home, streams: c.streams });

    expect(code).toBe(0);
    expect(c.stdout()).toContain("SOLO AT V1");
    expect(c.stdout()).not.toContain("SOLO AT HEAD");
  });

  test("crew info previews a skill deleted at HEAD", () => {
    const home = makeCrewHome();
    const repo = deletedAtHeadRepo();
    runCli(["tap", "add", `file://${repo}`, "mytap"], {
      home,
      streams: captureStreams().streams,
    });

    const c = captureStreams();
    const code = runCli(["info", "mytap/gone@v1"], { home, streams: c.streams });

    expect(code).toBe(0);
    expect(c.stdout()).toContain("ONLY AT V1");
  });
});

describe("C-INST-05f sibling dependencies read the parent's commit", () => {
  test("a pinned parent pulls its sibling from the same commit", () => {
    const repo = makeTempDir("crew-sibrepo-");
    makeSkill(
      repo,
      "parent",
      skillFrontmatter({
        name: "parent",
        description: "PARENT V1",
        dependencies: ["sibling"],
      }),
    );
    makeSkill(repo, "sibling", skillFrontmatter({ name: "sibling", description: "SIBLING V1" }));
    makeGitRepo(repo, "one");
    tag(repo, "v1");
    writeFileSync(
      join(repo, "sibling", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "sibling", description: "SIBLING HEAD" })}\n---\n`,
    );
    commitAll(repo, "move sibling on");

    const home = makeCrewHome();
    const code = runCli(["install", `file://${repo}@v1//parent`], {
      home,
      streams: captureStreams().streams,
    });

    expect(code).toBe(0);
    // The sibling's bytes must be the parent's commit, not HEAD —
    // otherwise state records the parent's SHA over HEAD's content.
    const installed = readFileSync(join(adapterRoot(), "sibling", "SKILL.md"), "utf8");
    expect(installed).toContain("SIBLING V1");
    expect(installed).not.toContain("SIBLING HEAD");

    // Bytes alone would still pass if state described them wrongly, so
    // pin the recorded provenance too. The sibling inherits the parent's
    // pinned ref, not just its commit: it was read from that commit, so
    // a later `crew update` must re-resolve the same tag rather than
    // drifting to HEAD (§9 step 3, §11.1).
    const state = readState(home);
    const parent = state.installations.find((e) => e.name === "parent");
    const sibling = state.installations.find((e) => e.name === "sibling");
    const v1Sha = runGit(["rev-parse", "v1^{commit}"], { cwd: repo }).stdout.trim();
    expect(parent?.resolved_sha).toBe(v1Sha);
    expect(sibling?.resolved_sha).toBe(v1Sha);
    expect(sibling?.ref).toBe("v1");
    expect(sibling?.pinned).toBe(true);
  });
});

describe("C-INST-05g the exported tree cannot escape via symlink", () => {
  test("a subpath that is a symlink out of the repo is refused", () => {
    const outside = makeTempDir("crew-outside-");
    makeSkill(outside, "outside", skillFrontmatter({ name: "outside", description: "ESCAPED" }));

    const repo = makeTempDir("crew-symrepo-");
    makeSkill(repo, "real", skillFrontmatter({ name: "real", description: "IN TREE" }));
    symlinkSync(join(outside, "outside"), join(repo, "evil"));
    makeGitRepo(repo, "one");
    tag(repo, "v1");

    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["install", "--json", `file://${repo}@v1//evil`], {
      home,
      streams: c.streams,
    });

    // The specified outcome, not merely "some failure": §13 gives this
    // a stable name and exit code, and asserting the pair is what stops
    // a future refactor turning containment into an unrelated error.
    expect(code).toBe(4);
    expect(JSON.parse(c.stdout()).error.name).toBe("invalid_skill");
    expect(existsSync(join(adapterRoot(), "outside"))).toBe(false);
  });
});
