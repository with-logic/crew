/**
 * Source credentials stay out of real human/JSON CLI output (§13,
 * C-REF-28, C-TAP-26), including refresh previews and scheme-less git errors.
 */

import { afterEach, describe, expect, test } from "bun:test";
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
import { tapWithUrl } from "./verbose/helpers.ts";

const SECRET = "PR113_PRIVATE_CREDENTIAL";
const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
afterEach(() => Object.assign(claudeCodeAdapter, original));

describe("credential query values never reach CLI output", () => {
  test.each([false, true])("C-REF-28 tap collision masks client_secret (json=%s)", (json) => {
    const home = makeCrewHome();
    tapWithUrl(home, "https://host/existing/repo.git");
    const capture = captureStreams();
    expect(
      runCli(
        [
          "tap",
          "add",
          `https://host/other/repo.git?client_secret=${SECRET}`,
          "creds",
          ...(json ? ["--json"] : []),
        ],
        { home, streams: capture.streams },
      ),
    ).toBe(4);
    const output = capture.stdout() + capture.stderr();
    expect(output).not.toContain(SECRET);
    expect(output).toContain("client_secret=***");
    if (json) expect(JSON.parse(capture.stdout()).error.name).toBe("usage_error");
  });

  test.each([false, true])("C-TAP-26 tap refresh dry-run masks credentials (json=%s)", (json) => {
    const home = makeCrewHome();
    tapWithUrl(home, `https://user:${SECRET}@host/repo.git?client_secret=${SECRET}&sig=${SECRET}`);
    const capture = captureStreams();
    expect(
      runCli(["tap", "update", "--dry-run", "creds", ...(json ? ["--json"] : [])], {
        home,
        streams: capture.streams,
      }),
    ).toBe(0);
    const output = capture.stdout() + capture.stderr();
    expect(output).not.toContain(SECRET);
    if (json) expect(JSON.parse(capture.stdout()).rows[0].kind).toBe("pending");
    expect(output).toContain("client_secret=***");
    expect(output).toContain("sig=***");
  });

  test.each([false, true])("C-REF-28 malformed URL errors fail closed (json=%s)", (json) => {
    const capture = captureStreams();
    expect(
      runCli(
        [
          "install",
          `https://user:${SECRET}@host:99999/repo?client_secret=${SECRET}`,
          ...(json ? ["--json"] : []),
        ],
        { home: makeCrewHome(), streams: capture.streams },
      ),
    ).toBe(4);
    const output = capture.stdout() + capture.stderr();
    expect(output).not.toContain(SECRET);
    expect(output).toContain("***");
    if (json) expect(JSON.parse(capture.stdout()).error.name).toBe("invalid_ref");
  });

  test.each(["client_secret", "sig", "provider_credential"])(
    "C-REF-28 git's scheme-less %s query is masked in errors",
    (parameter) => {
      const url = `file://${makeTempDir("crew-missing-")}/absent.git?${parameter}=${SECRET}`;
      for (const json of [false, true]) {
        const home = makeCrewHome();
        const capture = captureStreams();
        expect(
          runCli(["tap", "add", url, "creds", ...(json ? ["--json"] : [])], {
            home,
            streams: capture.streams,
          }),
        ).toBe(5);
        const output = capture.stdout() + capture.stderr();
        expect(output).not.toContain(SECRET);
        if (json) expect(JSON.parse(capture.stdout()).error.name).toBe("source_unreachable");
        expect(output).toContain(`${parameter}=***`);
        expect(output).toContain("does not appear to be a git repository");
      }
    },
  );
});

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
      expect(output).toContain("does not appear to be a git repository");
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
