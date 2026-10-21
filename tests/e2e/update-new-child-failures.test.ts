/** New tap-child target failures remain visible and retryable (§10.1.1, C-UPD-38). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import type { TapReexpandRow } from "../../src/install/tap-reexpand/types.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

const originals = {
  claudePath: claudeCodeAdapter.userPath,
  claudeDetect: claudeCodeAdapter.detect,
  codexPath: codexAdapter.userPath,
  codexDetect: codexAdapter.detect,
};
let claudeRoot = "";
let codexRoot = "";
beforeEach(() => {
  claudeRoot = makeTempDir("crew-child-claude-");
  codexRoot = makeTempDir("crew-child-codex-");
  claudeCodeAdapter.userPath = () => claudeRoot;
  claudeCodeAdapter.detect = () => true;
  codexAdapter.userPath = () => codexRoot;
  codexAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originals.claudePath;
  claudeCodeAdapter.detect = originals.claudeDetect;
  codexAdapter.userPath = originals.codexPath;
  codexAdapter.detect = originals.codexDetect;
});

function invoke(home: string, args: string[]) {
  const cap = captureStreams();
  const code = runCli(args, { home, streams: cap.streams });
  return { code, stdout: cap.stdout(), stderr: cap.stderr() };
}
function fixture() {
  const home = makeCrewHome();
  const repo = makeTempDir("crew-child-source-");
  makeSkill(repo, "alpha", skillFrontmatter({ name: "alpha" }));
  makeGitRepo(repo);
  const added = invoke(home, ["tap", "add", `file://${repo}`, "fixture"]);
  const installed = invoke(home, [
    "install",
    "fixture",
    "--agent",
    "claude-code",
    "--agent",
    "codex",
  ]);
  const alphaBytes = `${readFileSync(join(repo, "alpha", "SKILL.md"), "utf8")}\nUpdated alpha.\n`;
  writeFileSync(join(repo, "alpha", "SKILL.md"), alphaBytes);
  makeSkill(repo, "newbie", skillFrontmatter({ name: "newbie" }));
  makeSkill(repo, "other", skillFrontmatter({ name: "other" }));
  commitAll(repo, "add children");
  return { home, added, installed, alphaBytes };
}
function block(root: string) {
  mkdirSync(join(root, "newbie"));
  writeFileSync(join(root, "newbie", "mine"), "user bytes");
}

for (const blocked of ["claude-code", "codex", "both"]) {
  test(`C-UPD-38 ${blocked} failure is reported and retried without losing target membership`, () => {
    const { home, added, installed, alphaBytes } = fixture();
    expect(added.code).toBe(0);
    expect(installed.code).toBe(0);
    if (blocked !== "codex") block(claudeRoot);
    if (blocked !== "claude-code") block(codexRoot);
    const first = invoke(home, ["update", "fixture", "--json"]);
    expect(first.code).toBe(1);
    const result = JSON.parse(first.stdout) as { tap_reexpand_rows: TapReexpandRow[] };
    const row = result.tap_reexpand_rows.find((r) => r.name === "newbie")!;
    expect(row.kind).toBe("tap_error");
    expect(row.error?.code).toBe("untracked_directory");
    expect(row.error?.message).toContain("no .crew.json marker");
    for (const [agent, root] of [
      ["claude-code", claudeRoot],
      ["codex", codexRoot],
    ]) {
      if (blocked === agent || blocked === "both") {
        expect(row.error?.message).toContain(agent!);
        expect(readFileSync(join(root!, "newbie", "mine"), "utf8")).toBe("user bytes");
      } else {
        // Remaining target groups are still attempted after an earlier failure.
        expect(existsSync(join(root!, "newbie", "SKILL.md"))).toBe(true);
        expect(row.error?.message).toContain(`copies remain for successful targets: ${agent}`);
      }
    }
    for (const root of [claudeRoot, codexRoot])
      expect(readFileSync(join(root, "alpha", "SKILL.md"), "utf8")).toBe(alphaBytes);
    expect(row.error?.message?.includes("copies remain")).toBe(blocked !== "both");
    expect(readState(home).installations.some((e) => e.name === "newbie")).toBe(false);
    expect(readState(home).installations.find((e) => e.name === "other")?.agents).toEqual([
      "claude-code",
      "codex",
    ]);
    const human = invoke(home, ["update", "fixture"]);
    expect(human.code).toBe(1);
    expect(human.stdout).toContain("newbie");
    expect(human.stdout).toContain("untracked_directory");
    expect(human.stdout).toContain("1 failure");
    expect(human.stdout.includes("copies remain")).toBe(blocked !== "both");
    if (blocked !== "codex") rmSync(join(claudeRoot, "newbie"), { recursive: true });
    if (blocked !== "claude-code") rmSync(join(codexRoot, "newbie"), { recursive: true });
    expect(invoke(home, ["update", "fixture"]).code).toBe(0);
    expect(readState(home).installations.find((e) => e.name === "newbie")?.agents).toEqual([
      "claude-code",
      "codex",
    ]);
    for (const root of [claudeRoot, codexRoot])
      expect(existsSync(join(root, "newbie", "SKILL.md"))).toBe(true);
  });
}

test("C-UPD-38 a local filesystem failure is a child error, not source_unreachable", () => {
  const { home, added, installed } = fixture();
  expect(added.code).toBe(0);
  expect(installed.code).toBe(0);
  const blockedPath = join(makeTempDir("crew-child-file-"), "file");
  writeFileSync(blockedPath, "not a directory");
  codexRoot = blockedPath;
  const result = invoke(home, ["update", "fixture", "--json"]);
  expect(result.code).toBe(1);
  const parsed = JSON.parse(result.stdout) as { tap_reexpand_rows: TapReexpandRow[] };
  const row = parsed.tap_reexpand_rows.find((r) => r.name === "newbie")!;
  expect(row.kind).toBe("tap_error");
  expect(row.error?.code).toBe("usage_error");
  expect(row.error?.message).toContain("codex");
  expect(row.error?.message).toContain(blockedPath);
  expect(readState(home).installations.some((e) => e.name === "newbie")).toBe(false);
});

test("C-UPD-38 a failed shared target names every affected agent", () => {
  const { home } = fixture();
  codexRoot = claudeRoot;
  block(claudeRoot);
  const result = invoke(home, ["update", "fixture", "--json"]);
  expect(result.code).toBe(1);
  const parsed = JSON.parse(result.stdout) as { tap_reexpand_rows: TapReexpandRow[] };
  const row = parsed.tap_reexpand_rows.find((r) => r.name === "newbie")!;
  expect(row.error?.message).toContain("claude-code, codex");
  expect(readState(home).installations.some((e) => e.name === "newbie")).toBe(false);
});

test("C-UPD-38 a child staging error stays isolated and uses the local error code", () => {
  const { home } = fixture();
  chmodSync(paths(home).storeDir, 0o555);
  try {
    const result = invoke(home, ["update", "fixture", "--json"]);
    expect(result.code).toBe(1);
    const parsed = JSON.parse(result.stdout) as { tap_reexpand_rows: TapReexpandRow[] };
    expect(parsed.tap_reexpand_rows.map((r) => r.name).sort()).toEqual(["newbie", "other"]);
    expect(
      parsed.tap_reexpand_rows.every(
        (r) => r.kind === "tap_error" && r.error?.code === "usage_error",
      ),
    ).toBe(true);
    expect(readState(home).installations.map((e) => e.name)).toEqual(["alpha"]);
  } finally {
    chmodSync(paths(home).storeDir, 0o755);
  }
});
