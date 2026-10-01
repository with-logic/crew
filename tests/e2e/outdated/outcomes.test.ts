/**
 * `crew outdated` rendering for the outcome kinds that are not a plain
 * pending update (§10.1.1, C-UPD-18f).
 *
 * The preview suite covers `would_update` and `would_add`. These are the
 * rest of the noteworthy set that is reachable through the CLI — a skill
 * deleted upstream and a per-skill validation failure — plus `--force`
 * on a pinned skill, the one flag that changes which rows appear. Each
 * must reach the user: a row silently dropped here reads as "everything
 * is up to date", the failure mode C-UPD-18h exists to prevent.
 *
 * `missing_project_root` is covered here too, as a row this view
 * deliberately omits: it is a skip (C-UPD-22), and §10.1.1 trims skips.
 */

import { describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
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
import type { UpdateJson } from "../update-dry-run/helpers.ts";
import { installedFromRepo, moveUpstream, snapshot, useClaudeCodeRoot } from "./helpers.ts";

useClaudeCodeRoot();

/**
 * §10.1.1: `crew outdated --json` is byte-identical to `crew update
 * --dry-run --json`, so it is typed by the same interface rather than a
 * hand-written one. Reusing it keeps the outcome discriminants as their
 * real literal unions — widening `kind` to `string` would let a typo'd
 * or retired kind pass these assertions silently.
 */
type OutdatedJson = UpdateJson;

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

  test("a project install whose directory is gone is a skip, kept in JSON but trimmed from the human view", () => {
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
    // The JSON payload is identical to `crew update --dry-run --json`
    // (§10.1.1), so the row is still there for scripts to act on.
    expect(json.rows.some((r) => r.outcome.kind === "missing_project_root")).toBe(true);

    // But the human view is trimmed to what `crew update` would change,
    // and this is a skip (C-UPD-22: "reported and SKIPPED on update"),
    // so it does not appear as a pending change. `crew doctor` is the
    // command that reports it (C-STATE-11).
    const human = captureStreams();
    runCli(["outdated"], { home, cwd: elsewhere, streams: human.streams });
    expect(human.stdout()).toContain("Everything is up to date.");
    expect(human.stdout()).not.toContain("tool");
  });
});

describe("C-UPD-18f a per-skill failure is reported, not hidden", () => {
  test("a skill whose upstream version breaks validation is reported as failed", () => {
    // The source still resolves and the directory is still there — only
    // the new commit's frontmatter is invalid. `updateOne` validates
    // before returning `would_update` precisely so a preview surfaces
    // this instead of promising an update that would fail.
    const { home, repo } = installedFromRepo();
    writeFileSync(
      join(repo, "alpha", "SKILL.md"),
      // `description` is required by §9 step 4; dropping it is an
      // `invalid_skill`, one of the hard-failure codes.
      "---\nname: alpha\n---\nbody v2\n",
    );
    commitAll(repo, "break alpha");

    const before = snapshot(home);

    const json = outdatedJson(home);
    const failed = json.rows.filter((r) => r.outcome.kind === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.name).toBe("alpha");
    // The row carries the reason, not just the fact of failure.
    expect(failed[0]!.outcome).toMatchObject({ kind: "failed", error: { code: "invalid_skill" } });

    // Human output names the skill and never claims all is well.
    const human = outdatedHuman(home);
    expect(human).toContain("alpha");
    expect(human).toContain("failed");
    expect(human).not.toContain("Everything is up to date.");

    // A hard failure is exit 1 (§10.1 error isolation), and a preview
    // that failed still must not have written anything.
    const c = captureStreams();
    expect(runCli(["outdated"], { home, streams: c.streams })).toBe(1);
    expect(snapshot(home)).toEqual(before);
  });
});
