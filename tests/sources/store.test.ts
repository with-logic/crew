/** Source staging reports read failures without relabeling destination writes (§9, §13). */

import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copySourceTree } from "../../src/sources/read.ts";
import { stageIntoStore } from "../../src/sources/store.ts";
import { copyTree } from "../../src/util/copy.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

test("C-INST-23 failed copying removes partial store staging and keeps the source error", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  for (let i = 0; i < 20; i++) writeFileSync(join(skill, `asset-${i}`), "bytes");
  // Use the actual directory order so copying reaches readable files before this fault.
  const asset = join(skill, readdirSync(skill).at(-1)!);
  chmodSync(asset, 0);
  try {
    expect(() => stageIntoStore(skill, "demo", "a".repeat(40), home)).toThrow(
      expect.objectContaining({
        code: "source_unreachable",
        details: { path: asset },
        remedy: expect.stringContaining("source file"),
      }),
    );
  } finally {
    chmodSync(asset, 0o600);
  }
  expect(readdirSync(join(home, "store"))).toEqual([]);
  expect(readdirSync(skill)).toHaveLength(21);
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
    expect(() => copyTree(skill, destination, { destinationRoot: destination })).toThrow(
      expect.objectContaining({ code: "EACCES" }),
    );
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

test("staging a resolved git source identifies a nonlistable source directory", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  chmodSync(skill, 0o111);
  try {
    expect(() => stageIntoStore(skill, "demo", "a".repeat(40), home)).toThrow(
      expect.objectContaining({
        code: "source_unreachable",
        details: { path: skill },
        remedy: expect.stringContaining("source directory"),
      }),
    );
    const destination = makeTempDir();
    expect(() => copyTree(skill, destination, { destinationRoot: destination })).toThrow(
      expect.objectContaining({ code: "EACCES" }),
    );
  } finally {
    chmodSync(skill, 0o755);
  }
});

test("resolved git staging normalizes source lstat failure inside an unsearchable folder", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const assets = join(skill, "assets");
  mkdirSync(assets);
  const file = join(assets, "asset.txt");
  writeFileSync(file, "bytes");
  chmodSync(assets, 0o400);
  try {
    expect(() => stageIntoStore(skill, "demo", "a".repeat(40), home)).toThrow(
      expect.objectContaining({
        code: "source_unreachable",
        details: { path: file },
        remedy: expect.stringContaining("source directory"),
      }),
    );
    const destination = makeTempDir();
    expect(() => copyTree(skill, destination, { destinationRoot: destination })).toThrow(
      expect.objectContaining({ code: "EACCES", syscall: "lstat", path: file }),
    );
  } finally {
    chmodSync(assets, 0o755);
  }
});

for (const nestedDestination of [false, true]) {
  test(`destination lstat failure remains native when destination is ${nestedDestination ? "within" : "outside"} source`, () => {
    const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    const destination = nestedDestination ? join(source, "target") : makeTempDir();
    mkdirSync(destination, { recursive: true });
    chmodSync(destination, 0o400);
    try {
      expect(() => copySourceTree(source, destination)).toThrow(
        expect.objectContaining({ code: "EACCES", syscall: "lstat" }),
      );
    } finally {
      chmodSync(destination, 0o755);
    }
  });
}

test("destination root lstat failure inside source remains native", () => {
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const blocked = join(source, "blocked");
  const destination = join(blocked, "target");
  mkdirSync(destination, { recursive: true });
  chmodSync(blocked, 0o400);
  try {
    expect(() => copySourceTree(source, destination)).toThrow(
      expect.objectContaining({ code: "EACCES", syscall: "lstat", path: destination }),
    );
  } finally {
    chmodSync(blocked, 0o755);
  }
});
