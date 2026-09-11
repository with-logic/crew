/**
 * `crew update --dry-run` is a preview (§10.1.1, C-UPD-18).
 *
 * Strategy: install from a local git tap, then move upstream (edit the
 * installed skill AND add a sibling). Run `update --dry-run` and prove
 * that (a) the output names both the pending update and the pending
 * addition, and (b) no installed state changed — installed bytes,
 * markers, store, and state.json are byte-identical before and after.
 *
 * Tap clones are the one documented exception: a dry run fetches and
 * checks them out, which is how it learns what moved (§10.1.1).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import type { TapReexpandRow } from "../../src/install/tap-reexpand.ts";
import type { UpdateRow } from "../../src/install/update/types.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
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

/** Mirrors the command's `--json` payload; discriminants keep their real types. */
interface UpdateJson {
  readonly dry_run: boolean;
  readonly rows: readonly UpdateRow[];
  readonly tap_reexpand_rows: readonly TapReexpandRow[];
}

/**
 * Everything a dry run must leave untouched: installed bytes, markers,
 * the store listing, and `state.json`.
 *
 * Tap clones are deliberately excluded — a dry run DOES fetch and check
 * them out (§10.1.1), which is how it learns what moved. They are the
 * one documented exception to "nothing is written".
 */
function snapshotInstalledState(home: string): Record<string, string> {
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
    const before = snapshotInstalledState(home);

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
    const before = snapshotInstalledState(home);
    const moved = captureStreams();
    runCli(["update", "--dry-run", "--json"], { home, streams: moved.streams });
    const row = (JSON.parse(moved.stdout()) as UpdateJson).rows[0]!;
    expect(row.outcome).toEqual({ kind: "would_update", new_sha: null });
    expect(snapshotInstalledState(home)).toEqual(before);
    expect(readFileSync(join(ccRoot, "gamma", "SKILL.md"), "utf8")).toContain("one");
  });

  test("C-UPD-18a never creates state.json on a home that has none", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // `tap remove` rewrites config but leaves no state file behind.
    rmSync(paths(home).stateFile, { force: true });
    expect(existsSync(paths(home).stateFile)).toBe(false);

    const c = captureStreams();
    expect(runCli(["update", "--dry-run"], { home, streams: c.streams })).toBe(0);

    // Acquiring the state lock would touch `state.json` into existence;
    // a dry run must not take it (§14).
    expect(existsSync(paths(home).stateFile)).toBe(false);
    expect(existsSync(`${paths(home).stateFile}.lock`)).toBe(false);
  });

  test("C-UPD-18c an invalid new tap child fails instead of reporting would_add", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-dry-invalid-");
    makeGitRepo(repo);
    makeSkill(repo, "good", skillFrontmatter({ name: "good", description: "fine" }));
    commitAll(repo, "v1");
    expect(runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams })).toBe(
      0,
    );

    // A sibling whose name is valid but whose frontmatter is not:
    // discovery reads the name only, so it is found but must not
    // install (§9 step 4).
    makeSkill(repo, "bad", "name: bad");
    commitAll(repo, "v2");

    const dry = captureStreams();
    expect(runCli(["update", "--dry-run", "--json"], { home, streams: dry.streams })).toBe(1);
    const parsed = JSON.parse(dry.stdout()) as UpdateJson;
    const badRow = parsed.tap_reexpand_rows.find((r) => r.name === "bad")!;
    expect(badRow.kind).toBe("tap_error");
    expect(badRow.error?.code).toBe("invalid_skill");

    // The real run agrees: same failure, and nothing lands on disk.
    expect(runCli(["update"], { home, streams: captureStreams().streams })).toBe(1);
    expect(existsSync(join(ccRoot, "bad"))).toBe(false);
  });

  test("C-UPD-18b --force --dry-run previews a pinned skill without writing", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = makeTempDir("crew-dry-pinned-");
    makeGitRepo(repo);
    makeSkill(repo, "delta", skillFrontmatter({ name: "delta", description: "v1" }), "body v1\n");
    commitAll(repo, "v1");
    tagRepo(repo, "v1.0.0");
    expect(
      runCli(["install", `file://${repo}@v1.0.0`], { home, streams: captureStreams().streams }),
    ).toBe(0);

    writeFileSync(
      join(repo, "delta", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "delta", description: "v2" })}\n---\nbody v2\n`,
    );
    commitAll(repo, "v2");
    const before = snapshotInstalledState(home);

    // Without --force a pinned entry is skipped outright.
    const plain = captureStreams();
    expect(runCli(["update", "--dry-run", "--json"], { home, streams: plain.streams })).toBe(0);
    expect((JSON.parse(plain.stdout()) as UpdateJson).rows[0]!.outcome.kind).toBe("skipped");

    // With --force it previews the move but still writes nothing.
    const forced = captureStreams();
    expect(
      runCli(["update", "--dry-run", "--force", "--json"], { home, streams: forced.streams }),
    ).toBe(0);
    expect((JSON.parse(forced.stdout()) as UpdateJson).rows[0]!.outcome.kind).toBe("would_update");
    expect(snapshotInstalledState(home)).toEqual(before);
    expect(readFileSync(join(ccRoot, "delta", "SKILL.md"), "utf8")).toContain("body v1");
  });
});
