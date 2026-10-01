/** A successful partial removal cannot seed dependency pruning (§7.4 step 5). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../src/agents/codex.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import {
  installWithDep,
  quiet,
  redirectClaudeCode,
  restoreClaudeCode,
} from "../helpers/scoped-install.ts";

let cc: ReturnType<typeof redirectClaudeCode>;
let codexRoot: string;
const original = { user: codexAdapter.userPath, detect: codexAdapter.detect };
beforeEach(() => {
  cc = redirectClaudeCode();
  codexRoot = makeTempDir();
  (codexAdapter as { userPath: () => string }).userPath = () => codexRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  restoreClaudeCode(cc.originals);
  (codexAdapter as { userPath: () => string }).userPath = original.user;
  (codexAdapter as { detect: () => boolean }).detect = original.detect;
});

test("C-UNINST-13 successful --agent removal leaves parent and dependencies alive", () => {
  const home = makeCrewHome();
  const cwd = makeTempDir();
  expect(installWithDep(home, "parent", "dep", "user", cwd)).toBe(0);
  expect(installWithDep(home, "other", "orphan", "user", cwd)).toBe(0);
  expect(runCli(["uninstall", "other"], { home, cwd, streams: quiet() })).toBe(0);
  expect(
    runCli(["uninstall", "--agent", "claude-code", "--prune", "parent"], {
      home,
      cwd,
      streams: quiet(),
    }),
  ).toBe(0);
  const entries = readState(home).installations;
  expect(entries.find((e) => e.name === "parent")!.agents).toEqual(["codex"]);
  expect(entries.find((e) => e.name === "dep")!.required_by).toEqual(["parent"]);
  expect(entries.some((e) => e.name === "orphan")).toBe(true);
  expect(existsSync(join(cc.userRoot, "parent"))).toBe(false);
  expect(existsSync(join(codexRoot, "parent", "SKILL.md"))).toBe(true);
});
