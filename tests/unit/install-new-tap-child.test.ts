/** New-child target transactions preserve preexisting installs (§10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ampAdapter } from "../../src/agents/amp.ts";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { installNewTapChild } from "../../src/install/install-new-tap-child.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const adapters = [claudeCodeAdapter, codexAdapter, ampAdapter];
const originals = adapters.map((adapter) => ({ ...adapter }));
let home: string;
let claudeRoot: string;
let codexRoot: string;
let input: Parameters<typeof installNewTapChild>[0];
beforeEach(() => {
  home = makeCrewHome();
  claudeRoot = makeTempDir("crew-child-claude-");
  codexRoot = makeTempDir("crew-child-codex-");
  claudeCodeAdapter.userPath = () => claudeRoot;
  claudeCodeAdapter.projectPath = claudeCodeAdapter.userPath;
  claudeCodeAdapter.detect = () => true;
  codexAdapter.userPath = () => codexRoot;
  codexAdapter.projectPath = codexAdapter.userPath;
  codexAdapter.detect = () => true;
  ampAdapter.userPath = claudeCodeAdapter.userPath;
  ampAdapter.projectPath = ampAdapter.userPath;
  ampAdapter.detect = () => true;
  const root = makeTempDir("crew-child-source-");
  input = {
    skillDir: makeSkill(root, "newbie", skillFrontmatter({ name: "newbie" })),
    skillName: "newbie",
    tapRelativePath: "newbie",
    scope: "user",
    tap: { name: "local", kind: "path", registered: true, path: root, url: "", subpath: "" },
    agents: ["claude-code", "codex"],
    resolvedSha: null,
    projectRoot: null,
    ref: null,
    pinned: false,
  };
});
afterEach(() => {
  for (let index = 0; index < adapters.length; index++)
    Object.assign(adapters[index]!, originals[index]);
});

test("C-UPD-18i preserves a preexisting managed destination when another target fails", () => {
  for (const adapter of adapters) expect(adapter.detect()).toBe(true);
  const first = installNewTapChild({ ...input, agents: ["claude-code"] }, false, home, home);
  expect(first.entry?.agents).toEqual(["claude-code"]);
  const markerPath = join(claudeRoot, "newbie", ".crew.json");
  const marker = readFileSync(markerPath, "utf8");
  mkdirSync(join(codexRoot, "newbie"));
  const failed = installNewTapChild(input, false, home, home);
  expect(failed.entry).toBeNull();
  expect(failed.perTarget).toMatchObject([
    { agent: "claude-code", kind: "up_to_date" },
    { agent: "codex", kind: "failed", error: { code: "untracked_directory" } },
  ]);
  expect(readFileSync(markerPath, "utf8")).toBe(marker);
});

test("C-UPD-18i shared-path targets roll back one new copy and report both agents", () => {
  mkdirSync(join(codexRoot, "newbie"));
  const result = installNewTapChild(
    { ...input, agents: ["claude-code", "amp", "codex"] },
    false,
    home,
    home,
  );
  expect(result.entry).toBeNull();
  expect(result.perTarget).toMatchObject([
    { agent: "claude-code", kind: "rolled_back" },
    { agent: "amp", kind: "rolled_back" },
    { agent: "codex", kind: "failed" },
  ]);
  expect(existsSync(join(claudeRoot, "newbie"))).toBe(false);
});

test("C-UPD-18i cleanup failures remain visible with the original target failure", () => {
  mkdirSync(join(codexRoot, "newbie"));
  let pathCalls = 0;
  codexAdapter.userPath = () => {
    if (++pathCalls === 2) chmodSync(claudeRoot, 0o555);
    return codexRoot;
  };
  try {
    const result = installNewTapChild(input, false, home, home);
    expect(result.entry).toBeNull();
    expect(result.perTarget).toMatchObject([
      { agent: "claude-code", kind: "failed", error: { code: "source_unreachable" } },
      { agent: "codex", kind: "failed", error: { code: "untracked_directory" } },
    ]);
    expect(result.perTarget[0]).toMatchObject({
      error: { message: expect.stringContaining("roll back") },
    });
    expect(existsSync(join(claudeRoot, "newbie"))).toBe(true);
  } finally {
    chmodSync(claudeRoot, 0o755);
  }
});

test("C-UPD-18i raw target errors are failures and other targets still run", () => {
  const notDirectory = join(codexRoot, "not-a-directory");
  writeFileSync(notDirectory, "blocked\n");
  codexAdapter.userPath = () => notDirectory;
  const result = installNewTapChild(input, false, home, home);
  expect(result.entry).toBeNull();
  expect(result.perTarget).toMatchObject([
    { agent: "claude-code", kind: "rolled_back" },
    { agent: "codex", kind: "failed", error: { code: "source_unreachable" } },
  ]);
});

test("C-UPD-18i no applicable target cannot produce a successful state entry", () => {
  claudeCodeAdapter.userPath = () => "";
  expect(
    installNewTapChild({ ...input, agents: ["unknown", "claude-code"] }, false, home, home),
  ).toEqual({
    entry: null,
    perTarget: [],
  });
});

test("C-UPD-18i successful project additions keep their recorded project root", () => {
  const result = installNewTapChild(
    { ...input, scope: "project", projectRoot: home },
    false,
    home,
    home,
  );
  expect(result.entry?.project_root).toBe(home);
  expect(result.entry?.agents).toEqual(["claude-code", "codex"]);
  expect(installNewTapChild({ ...input, scope: "project" }, true, home, home).entry?.scope).toBe(
    "project",
  );
});
