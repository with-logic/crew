/** Production confirmation defaults for destructive --all removal (§5.3.1, §7.4). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { realIO } from "../../../src/cli/prompt.ts";
import type { Scope } from "../../../src/core/types.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originalIO = { ...realIO };
const originalAdapter = {
  userPath: claudeCodeAdapter.userPath,
  projectPath: claudeCodeAdapter.projectPath,
  detect: claudeCodeAdapter.detect,
};

let user: string;
beforeEach(() => {
  user = makeTempDir("crew-confirm-user-");
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => user;
  (claudeCodeAdapter as { projectPath: (cwd: string) => string }).projectPath = (cwd) =>
    join(cwd, ".claude", "skills");
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});

afterEach(() => {
  realIO.isTTY = originalIO.isTTY;
  realIO.readByte = originalIO.readByte;
  realIO.writeStderr = originalIO.writeStderr;
  (claudeCodeAdapter as { userPath: () => string }).userPath = originalAdapter.userPath;
  (claudeCodeAdapter as { projectPath: (cwd: string) => string }).projectPath =
    originalAdapter.projectPath;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originalAdapter.detect;
});

function exerciseConfirmation(input: string, scope: Scope, fromElsewhere = false) {
  const home = makeCrewHome();
  const cwd = makeTempDir("crew-confirm-project-");
  const source = makeSkill(
    makeTempDir("crew-confirm-source-"),
    "alpha",
    skillFrontmatter({ name: "alpha" }),
  );
  const installCode = runCli(["install", source, "--scope", scope], {
    home,
    cwd,
    streams: captureStreams().streams,
  });
  const before = readState(home);
  const bytes = Buffer.from(input);
  let offset = 0;
  let message = "";
  realIO.isTTY = () => true;
  realIO.writeStderr = (text) => {
    message += text;
  };
  realIO.readByte = (buffer) => {
    buffer[0] = bytes[offset++]!;
    return 1;
  };
  const captured = captureStreams();
  const commandCwd = fromElsewhere ? makeTempDir("crew-confirm-elsewhere-") : cwd;
  const code = runCli(["uninstall", "--all", "--scope", scope], {
    home,
    cwd: commandCwd,
    streams: captured.streams,
  });
  const installedDir =
    scope === "user" ? join(user, "alpha") : join(cwd, ".claude", "skills", "alpha");
  return {
    home,
    cwd,
    commandCwd,
    installedDir,
    before,
    installCode,
    code,
    message,
    stderr: captured.stderr(),
  };
}

test("C-UNINST-25 project fallback confirmation names the actual selected root", () => {
  const result = exerciseConfirmation("\n", "project", true);
  expect(result.code).toBe(4);
  expect(result.message).toContain(result.cwd);
  expect(result.message).not.toContain(result.commandCwd);
  expect(readState(result.home)).toEqual(result.before);
  expect(existsSync(join(result.installedDir, "SKILL.md"))).toBe(true);
});

test.each([
  { input: "\n", scope: "user" },
  { input: " \n", scope: "project" },
] as const)("C-UNINST-25 Enter declines production --all confirmation (%j)", ({ input, scope }) => {
  const result = exerciseConfirmation(input, scope);
  expect(result.installCode).toBe(0);
  expect(result.message).toContain("[y/N]");
  expect(result.code).toBe(4);
  expect(result.stderr).toContain("Aborted");
  expect(readState(result.home)).toEqual(result.before);
  expect(existsSync(join(result.installedDir, "SKILL.md"))).toBe(true);
});

test.each([
  { input: "y\n", scope: "user" },
  { input: "yes\n", scope: "project" },
] as const)("C-UNINST-25 explicit yes accepts production confirmation (%j)", ({ input, scope }) => {
  const result = exerciseConfirmation(input, scope);
  expect(result.installCode).toBe(0);
  expect(result.code).toBe(0);
  expect(readState(result.home).installations).toEqual([]);
  expect(existsSync(result.installedDir)).toBe(false);
});
