/**
 * `crew update --dry-run` is a preview (§10.1.1, C-UPD-18).
 *
 * Strategy: install from a local git tap, then move upstream (edit the
 * installed skill AND add a sibling). Run `update --dry-run` and prove
 * that (a) the output names both the pending update and the pending
 * addition, and (b) nothing on disk changed — installed bytes, markers,
 * store, and state.json are byte-identical before and after.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

let ccRoot: string;
let originalUserPath: () => string;
let originalDetect: () => boolean;

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  originalUserPath = claudeCodeAdapter.userPath;
  originalDetect = claudeCodeAdapter.detect;
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originalUserPath;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originalDetect;
});

interface UpdateJson {
  readonly dry_run: boolean;
  readonly rows: readonly { name: string; outcome: { kind: string; new_sha?: string | null } }[];
  readonly tap_reexpand_rows: readonly { name: string; kind: string; tap: string }[];
}

function snapshot(home: string): Record<string, string> {
  const out: Record<string, string> = {};
  out["state"] = readFileSync(paths(home).stateFile, "utf8");
  out["store"] = existsSync(paths(home).storeDir)
    ? readdirSync(paths(home).storeDir).sort().join(",")
    : "";
  for (const skill of readdirSync(ccRoot)) {
    out[`skill:${skill}`] = readFileSync(join(ccRoot, skill, "SKILL.md"), "utf8");
    out[`marker:${skill}`] = readFileSync(join(ccRoot, skill, ".crew.json"), "utf8");
  }
  return out;
}

describe("C-UPD-18 crew update --dry-run", () => {
  test("reports would_update and would_add without writing anything", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-dry-");
    makeGitRepo(repo);
    makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "v1" }), "body v1\n");
    commitAll(repo, "v1");
    expect(runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams })).toBe(
      0,
    );
    const before = snapshot(home);

    // Upstream: alpha changes and beta appears.
    writeFileSync(
      join(repo, "alpha", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "alpha", description: "v2" })}\n---\nbody v2\n`,
    );
    makeSkill(repo, "beta", skillFrontmatter({ name: "beta", description: "new sibling" }));
    const newSha = commitAll(repo, "v2");

    const human = captureStreams();
    expect(runCli(["update", "--dry-run"], { home, streams: human.streams })).toBe(0);
    expect(human.stdout()).toContain("(dry run)");
    expect(human.stdout()).toContain("would update");
    expect(human.stdout()).toMatch(/would add 1 new skill from \S+: beta/);
    expect(human.stdout()).toContain("1 would update · 1 would add");

    // Byte-identical: installed files, markers, store listing, state.
    expect(snapshot(home)).toEqual(before);
    expect(existsSync(join(ccRoot, "beta"))).toBe(false);

    const json = captureStreams();
    expect(runCli(["update", "--dry-run", "--json"], { home, streams: json.streams })).toBe(0);
    const parsed = JSON.parse(json.stdout()) as UpdateJson;
    expect(parsed.dry_run).toBe(true);
    const alpha = parsed.rows.find((r) => r.name === "alpha")!;
    expect(alpha.outcome).toEqual({ kind: "would_update", new_sha: newSha });
    expect(parsed.tap_reexpand_rows).toHaveLength(1);
    expect(parsed.tap_reexpand_rows[0]).toMatchObject({ name: "beta", kind: "would_add" });
    expect(snapshot(home)).toEqual(before);

    // A real run afterwards still applies the change — the preview
    // didn't consume it.
    expect(runCli(["update"], { home, streams: captureStreams().streams })).toBe(0);
    expect(readFileSync(join(ccRoot, "alpha", "SKILL.md"), "utf8")).toContain("body v2");
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
    const before = snapshot(home);
    const moved = captureStreams();
    runCli(["update", "--dry-run", "--json"], { home, streams: moved.streams });
    const row = (JSON.parse(moved.stdout()) as UpdateJson).rows[0]!;
    expect(row.outcome).toEqual({ kind: "would_update", new_sha: null });
    expect(snapshot(home)).toEqual(before);
    expect(readFileSync(join(ccRoot, "gamma", "SKILL.md"), "utf8")).toContain("one");
  });
});
