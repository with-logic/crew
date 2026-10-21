/** Replacement transactions retain preexisting bytes, links and modes (§10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { installNewTapChild } from "../../src/install/install-new-tap-child/index.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const adapters = [claudeCodeAdapter, codexAdapter];
const originals = adapters.map((adapter) => ({ ...adapter }));
let home: string;
let claudeRoot: string;
let codexRoot: string;
let input: Parameters<typeof installNewTapChild>[0];
beforeEach(() => {
  home = makeCrewHome();
  claudeRoot = makeTempDir("crew-replace-claude-");
  codexRoot = makeTempDir("crew-replace-codex-");
  claudeCodeAdapter.userPath = () => claudeRoot;
  claudeCodeAdapter.detect = () => true;
  codexAdapter.userPath = () => codexRoot;
  codexAdapter.detect = () => true;
  const root = makeTempDir("crew-replace-source-");
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

function installFirst(): string {
  installNewTapChild({ ...input, agents: ["claude-code"] }, false, home, home);
  return join(claudeRoot, "newbie");
}

function contents(path: string): unknown {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return { link: readlinkSync(path), mode: stat.mode };
  if (stat.isFile()) return { bytes: readFileSync(path).toString("hex"), mode: stat.mode };
  return {
    mode: stat.mode,
    entries: readdirSync(path)
      .sort()
      .map((name) => [name, contents(join(path, name))]),
  };
}

test("C-UPD-18i restores an earlier replacement when a later target rejects untracked data", () => {
  const dest = installFirst();
  const before = contents(dest);
  writeFileSync(join(input.skillDir, "SKILL.md"), `${skillFrontmatter({ name: "newbie" })}\nnew\n`);
  mkdirSync(join(codexRoot, "newbie"));
  const failed = installNewTapChild(input, false, home, home);
  expect(failed.entry).toBeNull();
  expect(failed.perTarget).toMatchObject([
    { agent: "claude-code", kind: "rolled_back" },
    { agent: "codex", kind: "failed", error: { code: "untracked_directory" } },
  ]);
  expect(contents(dest)).toEqual(before);
  expect(readdirSync(claudeRoot)).toEqual(["newbie"]);
});

test("C-UPD-18i --force restores customized bytes, marker, symlinks and directory/file modes", () => {
  const dest = installFirst();
  const outside = join(makeTempDir("crew-replace-outside-"), "secret");
  writeFileSync(outside, "outside must not be copied\n");
  writeFileSync(join(dest, "local"), "local customization\n", { mode: 0o600 });
  utimesSync(join(dest, "local"), 123456789, 123456789);
  symlinkSync(outside, join(dest, "absolute-link"));
  symlinkSync("local", join(dest, "relative-link"));
  chmodSync(dest, 0o750);
  chmodSync(join(dest, "SKILL.md"), 0o700);
  const before = contents(dest);
  const blocked = join(codexRoot, "blocked");
  writeFileSync(blocked, "not a directory\n");
  codexAdapter.userPath = () => blocked;
  const failed = installNewTapChild(input, true, home, home);
  expect(failed.entry).toBeNull();
  expect(failed.perTarget[0]).toMatchObject({ kind: "rolled_back" });
  expect(contents(dest)).toEqual(before);
  expect(readFileSync(outside, "utf8")).toBe("outside must not be copied\n");
  expect(lstatSync(join(dest, "local")).mtimeMs).toBe(123456789000);
});

test("C-UPD-18i --force restores preexisting untracked data after a later I/O failure", () => {
  const dest = join(claudeRoot, "newbie");
  mkdirSync(dest, { mode: 0o750 });
  writeFileSync(join(dest, "mine"), "untracked\n", { mode: 0o600 });
  symlinkSync("missing", join(dest, "dangling"));
  const before = contents(dest);
  const blocked = join(codexRoot, "blocked");
  writeFileSync(blocked, "not a directory\n");
  codexAdapter.userPath = () => blocked;
  expect(installNewTapChild(input, true, home, home).entry).toBeNull();
  expect(contents(dest)).toEqual(before);
  expect(readdirSync(claudeRoot)).toEqual(["newbie"]);
});

test("C-UPD-18i successful replacement commits new bytes and removes its backup", () => {
  installFirst();
  const next = `${skillFrontmatter({ name: "newbie" })}\nreplacement\n`;
  writeFileSync(join(input.skillDir, "SKILL.md"), next);
  expect(installNewTapChild(input, false, home, home).entry?.agents).toEqual([
    "claude-code",
    "codex",
  ]);
  expect(readFileSync(join(claudeRoot, "newbie", "SKILL.md"), "utf8")).toBe(next);
  expect(readdirSync(claudeRoot)).toEqual(["newbie"]);
});

test("C-UPD-18i a marker-only foreign source cannot be replaced even with --force", () => {
  const dest = installFirst();
  const before = contents(dest);
  const result = installNewTapChild(
    { ...input, tap: { ...input.tap, path: makeTempDir("crew-replace-foreign-") } },
    true,
    home,
    home,
  );
  expect(result.entry).toBeNull();
  expect(result.perTarget[0]).toMatchObject({ kind: "failed", error: { code: "name_conflict" } });
  expect(contents(dest)).toEqual(before);
});

test("C-UPD-18i unchanged installs do not need a writable destination parent", () => {
  const dest = installFirst();
  chmodSync(claudeRoot, 0o555);
  try {
    const result = installNewTapChild({ ...input, agents: ["claude-code"] }, false, home, home);
    expect(result.perTarget).toEqual([{ agent: "claude-code", kind: "up_to_date" }]);
    expect(result.entry).not.toBeNull();
    expect(readdirSync(claudeRoot)).toEqual(["newbie"]);
    expect(lstatSync(dest).isDirectory()).toBe(true);
  } finally {
    chmodSync(claudeRoot, 0o755);
  }
});

test("C-UPD-18i --force still overrides a marker for a different skill name", () => {
  const dest = installFirst();
  const path = join(dest, ".crew.json");
  const marker = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify({ ...marker, name: "old-name", tap_path: "/old/source" }));
  expect(installNewTapChild(input, false, home, home).perTarget[0]).toMatchObject({
    kind: "failed",
    error: { code: "inconsistent_marker" },
  });
  expect(installNewTapChild(input, true, home, home).entry?.agents).toEqual([
    "claude-code",
    "codex",
  ]);
});

test("C-UPD-18i canonical marker source aliases do not conflict", () => {
  installFirst();
  const result = installNewTapChild(
    { ...input, tap: { ...input.tap, path: input.skillDir }, tapRelativePath: "" },
    true,
    home,
    home,
  );
  expect(result.entry).not.toBeNull();
});
