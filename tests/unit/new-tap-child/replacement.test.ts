/** New-child replacement receipts preserve recovery data through real failures (§10.1.1). */

import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ChildReplacement } from "../../../src/install/new-tap-child/replacement.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

function stage() {
  const staging = makeSkill(
    makeTempDir(),
    "newbie",
    skillFrontmatter({ name: "newbie" }),
    "replacement bytes",
  );
  writeFileSync(join(staging, ".crew.json"), "{}");
  return staging;
}

function prior() {
  const root = makeTempDir();
  const dest = makeSkill(root, "newbie", skillFrontmatter({ name: "newbie" }), "prior bytes");
  return { root, dest, replacement: new ChildReplacement(dest) };
}

test("C-UPD-38 an unsuccessful new receipt never removes a different writer's copy", () => {
  const root = makeTempDir();
  const dest = join(root, "newbie");
  const replacement = new ChildReplacement(dest);
  replacement.moveAsideForReplacement(stage());
  mkdirSync(dest);
  writeFileSync(join(dest, "mine"), "other writer");
  expect(replacement.rollback()).toBeNull();
  replacement.cleanup();
  expect(readFileSync(join(dest, "mine"), "utf8")).toBe("other writer");
});

test("C-UPD-38 failed move-aside access aborts before replacing prior bytes", () => {
  const { root, dest, replacement } = prior();
  chmodSync(root, 0o000);
  try {
    expect(() => replacement.moveAsideForReplacement(stage())).toThrow("EACCES");
  } finally {
    chmodSync(root, 0o755);
  }
  expect(replacement.rollback()).toBeNull();
  replacement.cleanup();
  expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("prior bytes");
});

test("C-UPD-38 replacement moves unreadable prior bytes without duplicating their inode", () => {
  const { root, dest, replacement } = prior();
  const original = lstatSync(join(dest, "SKILL.md"));
  chmodSync(join(dest, "SKILL.md"), 0o000);
  replacement.moveAsideForReplacement(stage());
  const temporary = readdirSync(root).find((name) => name.startsWith(".crew-rollback-"))!;
  const moved = join(root, temporary, "prior", "SKILL.md");
  try {
    expect(existsSync(dest)).toBe(false);
    expect(lstatSync(moved).ino).toBe(original.ino);
    expect(lstatSync(moved).mode & 0o777).toBe(0);
  } finally {
    chmodSync(moved, 0o644);
  }
  expect(replacement.rollback()).toBeNull();
  expect(replacement.cleanup()).toBeNull();
  expect(readdirSync(root)).toEqual(["newbie"]);
  expect(lstatSync(join(dest, "SKILL.md")).ino).toBe(original.ino);
});

test("C-UPD-38 failed restoration retains and reports the complete backup", () => {
  const { root, dest, replacement } = prior();
  const staging = stage();
  replacement.moveAsideForReplacement(staging);
  renameSync(staging, dest);
  replacement.installed = true;
  chmodSync(root, 0o555);
  try {
    const failure = replacement.rollback();
    expect(failure).toContain("rollback");
    expect(failure).toContain("prior copy retained at");
    replacement.cleanup();
    const backup = readdirSync(root).find((name) => name.startsWith(".crew-rollback-"))!;
    const recovery = join(root, backup, "prior", "SKILL.md");
    expect(failure).toContain(join(root, backup, "prior"));
    expect(readFileSync(recovery, "utf8")).toContain("prior bytes");
  } finally {
    chmodSync(root, 0o755);
  }
});

test("C-UPD-38 failure removing a new copy reports rollback without claiming a backup", () => {
  const root = makeTempDir();
  const dest = join(root, "newbie");
  const replacement = new ChildReplacement(dest);
  const staging = stage();
  replacement.moveAsideForReplacement(staging);
  renameSync(staging, dest);
  replacement.installed = true;
  chmodSync(root, 0o555);
  try {
    const failure = replacement.rollback();
    expect(failure).toContain("rollback");
    expect(failure).not.toContain("prior copy retained");
  } finally {
    chmodSync(root, 0o755);
  }
});

test("C-UPD-38 backup cleanup failure cannot change a successful outcome", () => {
  const { root, dest, replacement } = prior();
  replacement.moveAsideForReplacement(stage());
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "SKILL.md"), "success bytes");
  const temporary = readdirSync(root).find((name) => name.startsWith(".crew-rollback-"))!;
  chmodSync(root, 0o555);
  try {
    const warning = replacement.cleanup();
    expect(warning).toContain("could not remove rollback directory");
    expect(warning).toContain(join(root, temporary));
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("success bytes");
  } finally {
    chmodSync(root, 0o755);
  }
  replacement.cleanup();
  expect(readdirSync(root)).toEqual(["newbie"]);
});

test("C-UPD-38 cleanup diagnostics escape controls and redact credentials at their producer", () => {
  const root = join(makeTempDir(), "controls\n\r\x1b\x7f\x85", "?token=cleanup-secret");
  const dest = makeSkill(root, "newbie", skillFrontmatter({ name: "newbie" }));
  const replacement = new ChildReplacement(dest);
  replacement.moveAsideForReplacement(stage());
  chmodSync(root, 0o555);
  try {
    const warning = replacement.cleanup()!;
    expect(warning).toContain("could not remove rollback directory");
    expect(warning).toContain("controls\\x0a\\x0d\\x1b\\x7f\\x85");
    for (const control of ["\n", "\r", "\x1b", "\x7f", "\x85"])
      expect(warning).not.toContain(control);
    expect(warning).not.toContain("cleanup-secret");
    expect(warning).toContain("token=***");
  } finally {
    chmodSync(root, 0o755);
    replacement.cleanup();
  }
});

test("C-UPD-38 an uninspectable destination retains its publication and complete prior backup", () => {
  const { root, dest, replacement } = prior();
  writeFileSync(join(dest, ".crew.json"), '{"prior":true}');
  const priorBytes = readFileSync(join(dest, "SKILL.md"));
  const priorMarker = readFileSync(join(dest, ".crew.json"));
  const priorInode = lstatSync(dest).ino;
  const staging = stage();
  replacement.moveAsideForReplacement(staging);
  const temporary = readdirSync(root).find((name) => name.startsWith(".crew-rollback-"))!;
  const backup = join(root, temporary, "prior");
  renameSync(staging, dest);
  replacement.installed = true;
  const publishedBytes = readFileSync(join(dest, "SKILL.md"));
  const publishedMarker = readFileSync(join(dest, ".crew.json"));
  const publishedInode = lstatSync(dest).ino;
  let failure: string | null = null;
  chmodSync(root, 0o000);
  try {
    failure = replacement.rollback();
    expect(replacement.cleanup()).toBeNull();
  } finally {
    chmodSync(root, 0o755);
  }
  expect(failure).toContain(dest);
  expect(failure).toContain("EACCES");
  expect(failure).toContain(`prior copy retained at \`${backup}\``);
  expect(readFileSync(join(dest, "SKILL.md"))).toEqual(publishedBytes);
  expect(readFileSync(join(dest, ".crew.json"))).toEqual(publishedMarker);
  expect(lstatSync(dest).ino).toBe(publishedInode);
  expect(readFileSync(join(backup, "SKILL.md"))).toEqual(priorBytes);
  expect(readFileSync(join(backup, ".crew.json"))).toEqual(priorMarker);
  expect(lstatSync(backup).ino).toBe(priorInode);
});
