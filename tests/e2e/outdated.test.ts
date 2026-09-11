/**
 * `crew outdated` is `crew update --dry-run` with a trimmed rendering
 * (§10.1.1, C-UPD-18a).
 *
 * Strategy mirrors the update dry-run test: install from a local git
 * tap, move upstream (edit + add a sibling), then prove `outdated`
 * lists both pending changes, writes nothing, and that its `--json`
 * payload is byte-identical to `update --dry-run --json`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import { runGit } from "../../src/git/exec.ts";
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

/** Fresh home with the default tap removed and one skill installed from a local git repo. */
function installedFromRepo(): { home: string; repo: string } {
  const home = makeCrewHome();
  runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
  const repo = makeTempDir("crew-outdated-");
  makeGitRepo(repo);
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha", description: "v1" }), "body v1\n");
  commitAll(repo, "v1");
  runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams });
  return { home, repo };
}

describe("C-UPD-18a crew outdated", () => {
  test("lists pending updates and additions, writes nothing, matches update --dry-run --json", () => {
    const { home, repo } = installedFromRepo();
    const before = snapshot(home);

    writeFileSync(
      join(repo, "alpha", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "alpha", description: "v2" })}\n---\nbody v2\n`,
    );
    makeSkill(repo, "beta", skillFrontmatter({ name: "beta", description: "new sibling" }));
    commitAll(repo, "v2");

    const human = captureStreams();
    expect(runCli(["outdated"], { home, streams: human.streams })).toBe(0);
    const out = human.stdout();
    expect(out).toContain("1 skill would change");
    expect(out).toContain("alpha");
    expect(out).toContain("would update");
    expect(out).toMatch(/1 new skill available from \S+: beta/);
    expect(out).toContain("Run `crew update` to apply.");
    expect(out).not.toContain("up to date");
    expect(snapshot(home)).toEqual(before);
    expect(existsSync(join(ccRoot, "beta"))).toBe(false);

    const outdatedJson = captureStreams();
    expect(runCli(["outdated", "--json"], { home, streams: outdatedJson.streams })).toBe(0);
    const dryRunJson = captureStreams();
    expect(runCli(["update", "--dry-run", "--json"], { home, streams: dryRunJson.streams })).toBe(
      0,
    );
    expect(outdatedJson.stdout()).toBe(dryRunJson.stdout());
    expect((JSON.parse(outdatedJson.stdout()) as { dry_run: boolean }).dry_run).toBe(true);
    expect(snapshot(home)).toEqual(before);
  });

  test("says everything is up to date when nothing would change", () => {
    const { home } = installedFromRepo();
    const before = snapshot(home);
    const c = captureStreams();
    expect(runCli(["outdated"], { home, streams: c.streams })).toBe(0);
    expect(c.stdout()).toContain("Everything is up to date.");
    expect(c.stdout()).not.toContain("alpha");
    expect(snapshot(home)).toEqual(before);
  });

  test("accepts selectors like update and reports the selected skill only", () => {
    const { home, repo } = installedFromRepo();
    writeFileSync(
      join(repo, "alpha", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "alpha", description: "v2" })}\n---\nbody v2\n`,
    );
    commitAll(repo, "v2");
    const c = captureStreams();
    expect(runCli(["outdated", "alpha"], { home, streams: c.streams })).toBe(0);
    expect(c.stdout()).toContain("would update");
    expect(readFileSync(join(ccRoot, "alpha", "SKILL.md"), "utf8")).toContain("body v1");
  });

  test("surfaces a project-scope location and an unreachable tap", () => {
    const { home, repo } = installedFromRepo();
    const project = makeTempDir("crew-proj-");
    expect(
      runCli(["install", "--scope", "project", `file://${repo}`], {
        home,
        cwd: project,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    writeFileSync(
      join(repo, "alpha", "SKILL.md"),
      `---\n${skillFrontmatter({ name: "alpha", description: "v2" })}\n---\nbody v2\n`,
    );
    commitAll(repo, "v2");
    const c = captureStreams();
    expect(runCli(["outdated"], { home, cwd: project, streams: c.streams })).toBe(0);
    expect(c.stdout()).toContain("2 skills would change");
    expect(c.stdout()).toContain(`(in ${project}`);

    // Now make the tap unreachable (point its clone at a dead remote):
    // the refresh warning renders first.
    const tapName = readdirSync(paths(home).tapsDir)[0]!;
    runGit(["remote", "set-url", "origin", "file:///does/not/exist/crew-gone"], {
      cwd: join(paths(home).tapsDir, tapName),
    });
    const warn = captureStreams();
    runCli(["outdated"], { home, cwd: project, streams: warn.streams });
    expect(warn.stdout()).toContain("couldn't refresh tap");

    // With the clone gone AND the configured URL dead, re-expansion
    // can't acquire the tap at all: a tap-level error row renders too.
    rmSync(join(paths(home).tapsDir, tapName), { recursive: true, force: true });
    const cfg = join(home, "config.yaml");
    writeFileSync(
      cfg,
      readFileSync(cfg, "utf8").replaceAll(`file://${repo}`, "file:///does/not/exist/crew-gone"),
    );
    const dead = captureStreams();
    runCli(["outdated"], { home, cwd: project, streams: dead.streams });
    expect(dead.stdout()).toContain("couldn't refresh tap");
    expect(dead.stdout()).toMatch(/tap \S+ \(source_unreachable\)/);
  });

  test("appears in help", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    expect(runCli(["help", "outdated"], { home, streams: c.streams })).toBe(0);
    expect(c.stdout()).toContain("crew outdated [<name>...]");
  });
});
