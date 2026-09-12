/**
 * `crew outdated` rendering for the outcome kinds that are not a plain
 * pending update (§10.1.1, C-UPD-18f).
 *
 * The preview suite covers `would_update` and `would_add`. These are the
 * rest of the noteworthy set that is reachable through the CLI — a skill
 * deleted upstream and a project whose directory is gone — plus `--force`
 * on a pinned skill, the one flag that changes which rows appear. Each
 * must reach the user: a row silently dropped here reads as "everything
 * is up to date", the failure mode C-UPD-18h exists to prevent. See the
 * closing note on the `failed` kind.
 */

import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { runGit } from "../../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../../helpers/fixtures.ts";
import { installedFromRepo, moveUpstream, snapshot, useClaudeCodeRoot } from "./helpers.ts";

useClaudeCodeRoot();

interface OutdatedJson {
  readonly rows: { name: string; outcome: { kind: string } }[];
  readonly dry_run: boolean;
}

function outdatedJson(home: string, ...extra: string[]): OutdatedJson {
  const c = captureStreams();
  runCli(["outdated", "--json", ...extra], { home, streams: c.streams });
  return JSON.parse(c.stdout()) as OutdatedJson;
}

function outdatedHuman(home: string, ...extra: string[]): string {
  const c = captureStreams();
  runCli(["outdated", ...extra], { home, streams: c.streams });
  return c.stdout();
}

describe("C-UPD-18f crew outdated renders every noteworthy outcome", () => {
  test("--force on a pinned skill matches update --dry-run --force and writes nothing", () => {
    // Pin to a tag, then move the tag forward. Without --force a pinned
    // skill is skipped and reads as up to date; with it, the move shows.
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-pinned-");
    makeGitRepo(repo);
    makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "v1" }), "body v1\n");
    commitAll(repo, "v1");
    tagRepo(repo, "v1");
    expect(
      runCli(["install", `file://${repo}@v1`], { home, streams: captureStreams().streams }),
    ).toBe(0);

    moveUpstream(repo, "alpha");
    // Move the tag onto the new commit; `tagRepo` only creates one.
    runGit(["-c", "tag.gpgSign=false", "tag", "-f", "v1"], { cwd: repo });

    const before = snapshot(home);

    const forced = outdatedJson(home, "--force");
    const fromUpdate = (() => {
      const c = captureStreams();
      runCli(["update", "--dry-run", "--force", "--json"], { home, streams: c.streams });
      return JSON.parse(c.stdout()) as OutdatedJson;
    })();

    // Same payload as the canonical form: `outdated` is that command.
    expect(forced.rows).toEqual(fromUpdate.rows);
    expect(forced.dry_run).toBe(true);
    // And a preview of a pinned skill still changes nothing on disk.
    expect(snapshot(home)).toEqual(before);
  });

  test("a skill deleted upstream is listed, not silently dropped", () => {
    const { home, repo } = installedFromRepo();
    rmSync(join(repo, "alpha"), { recursive: true, force: true });
    commitAll(repo, "drop alpha");

    const json = outdatedJson(home);
    expect(json.rows.some((r) => r.outcome.kind === "source_gone")).toBe(true);

    const out = outdatedHuman(home);
    expect(out).toContain("alpha");
    expect(out).not.toContain("Everything is up to date.");
  });

  test("a project install whose directory is gone is listed as a change", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-proj-repo-");
    makeGitRepo(repo);
    makeSkill(repo, "tool", skillFrontmatter({ name: "tool", description: "v1" }), "body v1\n");
    commitAll(repo, "v1");

    const project = makeTempDir("crew-project-");
    expect(
      runCli(["install", "--scope", "project", `file://${repo}`], {
        home,
        cwd: project,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    rmSync(project, { recursive: true, force: true });

    const elsewhere = makeTempDir("crew-elsewhere-");
    const c = captureStreams();
    runCli(["outdated", "--json"], { home, cwd: elsewhere, streams: c.streams });
    const json = JSON.parse(c.stdout()) as OutdatedJson;
    expect(json.rows.some((r) => r.outcome.kind === "missing_project_root")).toBe(true);

    const human = captureStreams();
    runCli(["outdated"], { home, cwd: elsewhere, streams: human.streams });
    expect(human.stdout()).not.toContain("Everything is up to date.");
  });
});

// A per-skill `failed` row is deliberately not exercised here. Reaching
// one requires a source that resolves but whose bytes cannot be read,
// and every route to that goes through tap acquisition — which surfaces
// as a tap-level failure instead, already covered by `stale.test.ts`
// (C-UPD-18h) with stronger assertions than a duplicate here would add.
// `NOTEWORTHY` keeps `failed` listed so the row renders if that changes.
