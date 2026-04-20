/**
 * `crew update <name>` must scope its fetches to the taps and git caches
 * that back the named entries. Unrelated taps are left untouched — proven
 * by checking the unrelated tap's local HEAD after the run (C-UPD-23).
 *
 * `crew update` with no args retains the old behavior of refreshing every
 * configured tap (C-UPD-19). That's covered by the existing
 * tests/e2e/tap-install.test.ts; this file focuses on the scoped case.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { tapPath } from "../../src/core/paths.ts";
import { runGit } from "../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

function headSha(clonePath: string): string {
  return runGit(["rev-parse", "HEAD"], { cwd: clonePath }).stdout.trim();
}

function buildTap(prefix: string, skills: readonly { name: string; desc: string }[]): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  for (const s of skills) {
    makeSkill(repo, s.name, skillFrontmatter({ name: s.name, description: s.desc }));
  }
  commitAll(repo, "init");
  return repo;
}

describe("crew update fetch scope", () => {
  test("C-UPD-23 `crew update <name>` leaves unrelated taps' clones untouched", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });

    // Two taps: one holds `alpha` (the skill we'll install + update),
    // the other holds `zeta` (unrelated — should never be fetched by a
    // targeted `crew update alpha`).
    const repoA = buildTap("crew-scope-a-", [{ name: "alpha", desc: "a test skill" }]);
    const repoB = buildTap("crew-scope-b-", [{ name: "zeta", desc: "a test skill" }]);
    runCli(["tap", "add", `file://${repoA}`, "tap-a"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${repoB}`, "tap-b"], {
      home,
      streams: captureStreams().streams,
    });
    const installCode = runCli(["install", "alpha"], {
      home,
      streams: captureStreams().streams,
    });
    expect(installCode).toBe(0);

    // Advance both upstreams.
    makeSkill(repoA, "new-a", skillFrontmatter({ name: "new-a", description: "a new skill" }));
    commitAll(repoA, "add new-a");
    makeSkill(repoB, "new-b", skillFrontmatter({ name: "new-b", description: "a new skill" }));
    commitAll(repoB, "add new-b");

    const shaBBefore = headSha(tapPath("tap-b", home));

    // Targeted update: alpha only. tap-a should move; tap-b must not.
    const code = runCli(["update", "alpha"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(headSha(tapPath("tap-b", home))).toBe(shaBBefore);
  });

  test("C-UPD-23 `crew update` with no args still refreshes every configured tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repoA = buildTap("crew-scope-full-a-", [{ name: "alpha", desc: "a test skill" }]);
    const repoB = buildTap("crew-scope-full-b-", [{ name: "zeta", desc: "a test skill" }]);
    runCli(["tap", "add", `file://${repoA}`, "tap-a"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${repoB}`, "tap-b"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["install", "alpha"], { home, streams: captureStreams().streams });

    // Move upstream on both.
    makeSkill(repoA, "new-a", skillFrontmatter({ name: "new-a", description: "a new skill" }));
    commitAll(repoA, "add new-a");
    makeSkill(repoB, "new-b", skillFrontmatter({ name: "new-b", description: "a new skill" }));
    commitAll(repoB, "add new-b");

    const shaABefore = headSha(tapPath("tap-a", home));
    const shaBBefore = headSha(tapPath("tap-b", home));

    runCli(["update"], { home, streams: captureStreams().streams });
    // Both clones advanced.
    expect(headSha(tapPath("tap-a", home))).not.toBe(shaABefore);
    expect(headSha(tapPath("tap-b", home))).not.toBe(shaBBefore);
  });

  test("C-UPD-23 targeted update fetches the tap backing a named skill", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // Multi-skill tap: two skills at the tap root. We install only one
    // by bare name; the update filter must still pull its tap in.
    const namedRepo = buildTap("crew-scope-named-", [
      { name: "one", desc: "a test skill" },
      { name: "two", desc: "a test skill" },
    ]);
    // Unrelated tap that must NOT be refreshed.
    const otherRepo = buildTap("crew-scope-other-", [{ name: "other", desc: "a test skill" }]);
    runCli(["tap", "add", `file://${namedRepo}`, "named-tap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["tap", "add", `file://${otherRepo}`, "other-tap"], {
      home,
      streams: captureStreams().streams,
    });
    runCli(["install", "one"], { home, streams: captureStreams().streams });

    // Advance both upstreams.
    makeSkill(
      namedRepo,
      "fresh-skill",
      skillFrontmatter({ name: "fresh-skill", description: "a new skill" }),
    );
    commitAll(namedRepo, "add fresh");
    makeSkill(
      otherRepo,
      "fresh-other",
      skillFrontmatter({ name: "fresh-other", description: "a new skill" }),
    );
    commitAll(otherRepo, "add fresh-other");

    const shaNamedBefore = headSha(tapPath("named-tap", home));
    const shaOtherBefore = headSha(tapPath("other-tap", home));

    runCli(["update", "one"], { home, streams: captureStreams().streams });
    // Targeted tap advanced; unrelated tap is unchanged.
    expect(headSha(tapPath("named-tap", home))).not.toBe(shaNamedBefore);
    expect(headSha(tapPath("other-tap", home))).toBe(shaOtherBefore);
  });
});
