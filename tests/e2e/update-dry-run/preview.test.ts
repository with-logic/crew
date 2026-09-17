/**
 * `crew update --dry-run` previews a pending update and a pending tap
 * addition without touching installed state (§10.1.1, C-UPD-18).
 *
 * Each skill carries a resource file alongside `SKILL.md` so the
 * byte-purity assertion covers the whole installed tree, not just
 * frontmatter.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { ccRoot, redirectClaudeCode, snapshotInstalledState, type UpdateJson } from "./helpers.ts";

redirectClaudeCode();

describe("C-UPD-18 crew update --dry-run", () => {
  test("reports would_update and would_add without writing anything", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-dry-");
    makeGitRepo(repo);
    makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "v1" }), "body v1\n");
    writeFileSync(join(repo, "alpha", "reference.md"), "resource v1\n");
    commitAll(repo, "v1");
    expect(runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams })).toBe(
      0,
    );
    const before = snapshotInstalledState(home);

    // Upstream: alpha's frontmatter AND its resource change, and beta appears.
    writeFileSync(
      join(repo, "alpha", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "alpha", description: "v2" })}\n---\nbody v2\n`,
    );
    writeFileSync(join(repo, "alpha", "reference.md"), "resource v2\n");
    makeSkill(repo, "beta", skillFrontmatter({ name: "beta", description: "new sibling" }));
    const newSha = commitAll(repo, "v2");

    const human = captureStreams();
    expect(runCli(["update", "--dry-run"], { home, streams: human.streams })).toBe(0);
    expect(human.stdout()).toContain("(dry run)");
    expect(human.stdout()).toContain("would update");
    expect(human.stdout()).toMatch(/would add 1 new skill from \S+: beta/);
    expect(human.stdout()).toContain("1 would update · 1 would add");

    // Byte-identical across the whole installed and store trees.
    expect(snapshotInstalledState(home)).toEqual(before);
    expect(existsSync(join(ccRoot, "beta"))).toBe(false);

    const json = captureStreams();
    expect(runCli(["update", "--dry-run", "--json"], { home, streams: json.streams })).toBe(0);
    const parsed = JSON.parse(json.stdout()) as UpdateJson;
    expect(parsed.dry_run).toBe(true);
    const alpha = parsed.rows.find((r) => r.name === "alpha")!;
    expect(alpha.outcome).toEqual({ kind: "would_update", new_sha: newSha });
    expect(parsed.tap_reexpand_rows).toHaveLength(1);
    expect(parsed.tap_reexpand_rows[0]).toMatchObject({ name: "beta", kind: "would_add" });
    expect(snapshotInstalledState(home)).toEqual(before);

    // A real run afterwards still applies the change — the preview
    // didn't consume it — including the resource file.
    expect(runCli(["update"], { home, streams: captureStreams().streams })).toBe(0);
    expect(readFileSync(join(ccRoot, "alpha", "SKILL.md"), "utf8")).toContain("body v2");
    expect(readFileSync(join(ccRoot, "alpha", "reference.md"), "utf8")).toBe("resource v2\n");
    expect(existsSync(join(ccRoot, "beta", "SKILL.md"))).toBe(true);
  });

  test("path-kind tap: unchanged content is up_to_date, edited content is would_update", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const src = makeTempDir("crew-dry-path-");
    makeSkill(src, "gamma", skillFrontmatter({ name: "gamma" }), "one\n");
    expect(
      runCli(["install", join(src, "gamma")], { home, streams: captureStreams().streams }),
    ).toBe(0);

    const same = captureStreams();
    runCli(["update", "--dry-run", "--json"], { home, streams: same.streams });
    expect((JSON.parse(same.stdout()) as UpdateJson).rows[0]!.outcome.kind).toBe("up_to_date");

    writeFileSync(
      join(src, "gamma", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "gamma" })}\n---\ntwo\n`,
    );
    const before = snapshotInstalledState(home);
    const moved = captureStreams();
    runCli(["update", "--dry-run", "--json"], { home, streams: moved.streams });
    const row = (JSON.parse(moved.stdout()) as UpdateJson).rows[0]!;
    expect(row.outcome).toEqual({ kind: "would_update", new_sha: null });
    expect(snapshotInstalledState(home)).toEqual(before);
    expect(readFileSync(join(ccRoot, "gamma", "SKILL.md"), "utf8")).toContain("one");
  });
});
