/** Source staging reports read failures without relabeling destination writes (§9, §13). */

import { expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copySourceTree } from "../../src/sources/read.ts";
import { stageIntoStore } from "../../src/sources/store.ts";
import { copyTree } from "../../src/util/copy.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

test("staging a resolved git source identifies an unreadable asset", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const asset = join(skill, "asset.txt");
  writeFileSync(asset, "bytes");
  chmodSync(asset, 0);
  try {
    expect(() => stageIntoStore(skill, "demo", "a".repeat(40), home)).toThrow(
      expect.objectContaining({ code: "source_unreachable" }),
    );
  } finally {
    chmodSync(asset, 0o600);
  }
});

test("a store destination write failure is not source_unreachable", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  chmodSync(home, 0o500);
  try {
    expect(() => stageIntoStore(skill, "demo", "a".repeat(40), home)).toThrow(
      expect.objectContaining({ code: "EACCES" }),
    );
  } finally {
    chmodSync(home, 0o700);
  }
});

test("ordinary target copying keeps its native source read error", () => {
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const manifest = join(skill, "SKILL.md");
  const destination = makeTempDir();
  chmodSync(manifest, 0);
  try {
    expect(() => copyTree(skill, destination)).toThrow(expect.objectContaining({ code: "EACCES" }));
  } finally {
    chmodSync(manifest, 0o600);
  }
});

test("a source copy destination file failure retains the original error", () => {
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const destination = makeTempDir();
  const target = join(destination, "SKILL.md");
  writeFileSync(target, "existing destination");
  chmodSync(target, 0o400);
  try {
    expect(() => copySourceTree(skill, destination)).toThrow(
      expect.objectContaining({ code: "EACCES", syscall: "copyfile" }),
    );
  } finally {
    chmodSync(target, 0o600);
  }
});
