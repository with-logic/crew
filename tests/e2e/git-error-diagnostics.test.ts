/** Ordinary real Git failure diagnostics mask credentials and preserve installs (§10.1, C-UPD-41). */

import { afterEach, expect, test } from "bun:test";
import { readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { runGit } from "../../src/git/exec.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  cloneDirForTap,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

const SECRET = "PR113_PRIVATE_CREDENTIAL";
const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
afterEach(() => Object.assign(claudeCodeAdapter, original));

test.each(
  ["update", "outdated"].flatMap((command) =>
    ["'", '"', "<", ">", "`"].map((delimiter) => [command, delimiter] as const),
  ),
)(
  "C-UPD-41 %s redacts %s-prefixed query credentials from real Git failure diagnostics",
  (command, delimiter) => {
    const home = makeCrewHome();
    const target = makeTempDir("crew-redaction-target-");
    claudeCodeAdapter.userPath = () => target;
    claudeCodeAdapter.detect = () => true;
    const repo = join(makeTempDir(), `remote.git?token=${delimiter}${SECRET}`);
    makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
    makeGitRepo(repo);
    runGit(["branch", "feature"], { cwd: repo });
    const setup = captureStreams();
    expect(
      runCli(["tap", "add", `file://${repo}`, "creds"], { home, streams: setup.streams }),
    ).toBe(0);
    expect(
      runCli(["install", "creds/demo@feature", "--agent", "claude-code"], {
        home,
        streams: setup.streams,
      }),
    ).toBe(0);
    const before = readState(home);
    expect(before.installations[0]!.tracks_tap).not.toBe(true);
    const manifest = readFileSync(join(target, "demo", "SKILL.md"));
    const marker = readFileSync(join(target, "demo", ".crew.json"));
    const clone = cloneDirForTap("creds", home)!;
    // A missing cached branch forces the ordinary-row acquisition to retry the unavailable origin.
    runGit(["update-ref", "-d", "refs/remotes/origin/feature"], { cwd: clone });
    runGit(["update-ref", "-d", "refs/heads/feature"], { cwd: clone });
    renameSync(repo, `${repo}.offline`);
    for (const json of [false, true]) {
      const capture = captureStreams();
      expect(
        runCli([command, "demo", ...(json ? ["--json"] : [])], { home, streams: capture.streams }),
      ).toBe(1);
      const output = capture.stdout() + capture.stderr();
      expect(output).not.toContain(SECRET);
      expect(output).toContain("token=***");
      expect(output).not.toContain("does not appear to be a git repository");
      if (json) {
        const result = JSON.parse(capture.stdout());
        expect(result.rows[0].outcome.kind).toBe("failed");
        expect(result.rows[0].outcome.error.code).toBe("source_unreachable");
        expect(result.tap_reexpand_rows).toEqual([]);
      } else {
        expect(output).toContain("source unreachable: git fetch failed");
      }
      expect(readState(home)).toEqual(before);
      expect(readFileSync(join(target, "demo", "SKILL.md"))).toEqual(manifest);
      expect(readFileSync(join(target, "demo", ".crew.json"))).toEqual(marker);
    }
  },
);
