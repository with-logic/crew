/** Manifest links never supply skill metadata or installed bytes (§9; C-SPEC-15). */

import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { loadSkill, loadSkillName } from "../../src/skill/load.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const original = { ...claudeCodeAdapter };
afterEach(() => Object.assign(claudeCodeAdapter, original));

function linkedSkill(mode: "absolute" | "relative" | "internal"): string {
  const root = makeTempDir();
  const outside = makeSkill(root, "outside", skillFrontmatter({ name: "outside" }));
  const skill = join(root, "nested", "linked");
  mkdirSync(skill, { recursive: true });
  let target = join(outside, "SKILL.md");
  if (mode === "internal") {
    target = join(skill, "manifest.md");
    writeFileSync(target, `---\n${skillFrontmatter({ name: "inside" })}\n---\n`);
  }
  symlinkSync(mode === "absolute" ? target : relative(skill, target), join(skill, "SKILL.md"));
  return skill;
}

for (const load of [loadSkill, loadSkillName]) {
  test.each(["absolute", "relative", "internal"] as const)(
    `C-SPEC-15 ${load.name} rejects %s manifest links before reading them`,
    (mode) => {
      expect(() => load(linkedSkill(mode))).toThrow("must not be a symbolic link");
    },
  );
}

test("C-SPEC-15 manifest rejection happens before target-file access", () => {
  const skill = linkedSkill("absolute");
  const target = readlinkSync(join(skill, "SKILL.md"));
  chmodSync(target, 0);
  try {
    for (const load of [loadSkill, loadSkillName])
      expect(() => load(skill)).toThrow("must not be a symbolic link");
  } finally {
    chmodSync(target, 0o600);
  }
});

test("C-SPEC-15 an external manifest link cannot create an agent install or state entry", () => {
  const home = makeCrewHome();
  const dest = makeTempDir();
  claudeCodeAdapter.userPath = () => dest;
  claudeCodeAdapter.projectPath = claudeCodeAdapter.userPath;
  claudeCodeAdapter.detect = () => true;
  const output = captureStreams();
  const code = runCli(["install", linkedSkill("absolute"), "--agent", "claude-code", "--json"], {
    home,
    streams: output.streams,
  });
  expect(code).toBe(4);
  expect(output.stdout() + output.stderr()).toContain("invalid_skill");
  expect(readdirSync(claudeCodeAdapter.userPath())).toEqual([]);
  expect(readState(home).installations).toEqual([]);
});
