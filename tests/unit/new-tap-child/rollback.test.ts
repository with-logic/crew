/** New-child rollback restores prior bytes and respects physical target groups (§10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { installSkillIntoAgents } from "../../../src/agents/install.ts";
import { installNewTapChild } from "../../../src/install/new-tap-child/index.ts";
import { ChildReplacement } from "../../../src/install/new-tap-child/replacement.ts";
import { stageIntoStore } from "../../../src/sources/store.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originalClaude = claudeCodeAdapter.userPath;
const originalCodex = codexAdapter.userPath;
let claudeRoot = "";
let codexRoot = "";
beforeEach(() => {
  claudeRoot = makeTempDir("crew-rollback-claude-");
  codexRoot = makeTempDir("crew-rollback-codex-");
  claudeCodeAdapter.userPath = () => claudeRoot;
  codexAdapter.userPath = () => codexRoot;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalClaude;
  codexAdapter.userPath = originalCodex;
});
function fixture() {
  const home = makeCrewHome();
  const source = makeSkill(
    makeTempDir(),
    "newbie",
    skillFrontmatter({ name: "newbie" }),
    "new bytes",
  );
  const args = {
    skillDir: source,
    skillName: "newbie",
    tapRelativePath: "newbie",
    scope: "user" as const,
    tap: {
      name: "fixture",
      kind: "path" as const,
      path: source,
      registered: true,
      url: "",
      subpath: "",
    },
    agents: ["claude-code", "codex"],
    resolvedSha: "new-sha",
    projectRoot: null,
    ref: null,
    pinned: false,
  };
  return { home, args, run: (force = false) => installNewTapChild(args, force, home, source) };
}
function failCodex() {
  codexRoot = join(makeTempDir(), "file");
  writeFileSync(codexRoot, "not a directory");
}

for (const tracked of [false, true]) {
  test(`C-UPD-38 force replacement restores ${tracked ? "marked" : "untracked"} bytes and symlinks`, () => {
    const { home, args, run } = fixture();
    const prior = makeSkill(
      claudeRoot,
      "newbie",
      skillFrontmatter({ name: "newbie" }),
      "prior bytes",
    );
    const priorBytes = readFileSync(join(prior, "SKILL.md"));
    const marker = Buffer.from('{"name":"different","prior":"marker bytes"}');
    if (tracked) writeFileSync(join(prior, ".crew.json"), marker);
    const outside = join(makeTempDir(), "outside");
    writeFileSync(outside, "outside bytes");
    symlinkSync(outside, join(prior, "outside-link"));
    symlinkSync("SKILL.md", join(prior, "relative-link"));
    failCodex();
    expect(() => run(true)).toThrow("codex");
    expect(readFileSync(join(prior, "SKILL.md"))).toEqual(priorBytes);
    expect(existsSync(join(prior, ".crew.json"))).toBe(tracked);
    if (tracked) expect(readFileSync(join(prior, ".crew.json"))).toEqual(marker);
    expect(readlinkSync(join(prior, "outside-link"))).toBe(outside);
    expect(readlinkSync(join(prior, "relative-link"))).toBe("SKILL.md");
    expect(readFileSync(outside, "utf8")).toBe("outside bytes");
    // A successful retry commits the new bytes after the failed target is repaired.
    codexRoot = makeTempDir();
    expect(installNewTapChild(args, true, home, prior)?.agents).toEqual(["claude-code", "codex"]);
    expect(readFileSync(join(prior, "SKILL.md"), "utf8")).toContain("new bytes");
  });
}

test("C-UPD-38 up-to-date targets retain their inode when another target fails", () => {
  const { home, args, run } = fixture();
  installNewTapChild({ ...args, agents: ["claude-code"] }, false, home, claudeRoot);
  const file = join(claudeRoot, "newbie", "SKILL.md");
  const marker = readFileSync(join(claudeRoot, "newbie", ".crew.json"));
  const before = lstatSync(file);
  failCodex();
  expect(() => run()).toThrow("codex");
  expect(lstatSync(file).ino).toBe(before.ino);
  expect(lstatSync(file).mtimeMs).toBe(before.mtimeMs);
  expect(readFileSync(join(claudeRoot, "newbie", ".crew.json"))).toEqual(marker);
});

test("C-UPD-38 shared paths install once and record both owners", () => {
  const { run } = fixture();
  codexRoot = claudeRoot;
  expect(run()?.agents).toEqual(["claude-code", "codex"]);
  const marker = JSON.parse(readFileSync(join(claudeRoot, "newbie", ".crew.json"), "utf8"));
  expect(marker.agents).toEqual(["claude-code", "codex"]);
});

test("C-UPD-38 force replacement restores a root symlink without changing its target", () => {
  const { run } = fixture();
  const outside = makeSkill(
    makeTempDir(),
    "prior",
    skillFrontmatter({ name: "newbie" }),
    "outside prior",
  );
  const bytes = readFileSync(join(outside, "SKILL.md"));
  const dest = join(claudeRoot, "newbie");
  symlinkSync(outside, dest);
  failCodex();
  expect(() => run(true)).toThrow("codex");
  expect(readlinkSync(dest)).toBe(outside);
  expect(readFileSync(join(outside, "SKILL.md"))).toEqual(bytes);
});

test("C-UPD-38 a failed install rename restores the moved prior tree", () => {
  const { home, args } = fixture();
  const dest = makeSkill(claudeRoot, "newbie", skillFrontmatter({ name: "newbie" }), "prior bytes");
  const locked = join(dest, "locked");
  mkdirSync(locked);
  writeFileSync(join(locked, "asset"), "prior asset");
  const staged = stageIntoStore(args.skillDir, "newbie", args.resolvedSha, home);
  const replacement = new ChildReplacement(dest);
  const original = lstatSync(join(dest, "SKILL.md"));
  try {
    expect(() =>
      installSkillIntoAgents({
        agents: [claudeCodeAdapter],
        scope: "user",
        cwd: claudeRoot,
        storePath: staged.storePath,
        skillName: "newbie",
        tap: args.tap,
        tapRelativePath: "newbie",
        ref: null,
        resolvedSha: args.resolvedSha,
        contentHash: staged.contentHash,
        force: true,
        beforeReplace: () => {
          replacement.moveAsideForReplacement();
          chmodSync(claudeRoot, 0o555);
        },
      }),
    ).toThrow("EACCES");
  } finally {
    chmodSync(claudeRoot, 0o755);
  }
  expect(replacement.rollback()).toBeNull();
  replacement.cleanup();
  expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("prior bytes");
  expect(readFileSync(join(locked, "asset"), "utf8")).toBe("prior asset");
  expect(lstatSync(join(dest, "SKILL.md")).ino).toBe(original.ino);
});
