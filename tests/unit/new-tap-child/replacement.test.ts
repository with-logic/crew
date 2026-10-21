/** New-child replacement receipts preserve recovery data through real failures (§10.1.1). */

import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ChildReplacement } from "../../../src/install/new-tap-child/replacement.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

function prior() {
  const root = makeTempDir();
  const dest = makeSkill(root, "newbie", skillFrontmatter({ name: "newbie" }), "prior bytes");
  return { root, dest, replacement: new ChildReplacement(dest) };
}

test("C-UPD-38 an unsuccessful new receipt never removes a different writer's copy", () => {
  const root = makeTempDir();
  const dest = join(root, "newbie");
  const replacement = new ChildReplacement(dest);
  replacement.snapshot();
  mkdirSync(dest);
  writeFileSync(join(dest, "mine"), "other writer");
  expect(replacement.rollback()).toBeNull();
  replacement.cleanup();
  expect(readFileSync(join(dest, "mine"), "utf8")).toBe("other writer");
});

test("C-UPD-38 failed snapshot access aborts before replacing prior bytes", () => {
  const { root, dest, replacement } = prior();
  chmodSync(root, 0o000);
  try {
    expect(() => replacement.snapshot()).toThrow("EACCES");
  } finally {
    chmodSync(root, 0o755);
  }
  expect(replacement.rollback()).toBeNull();
  replacement.cleanup();
  expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("prior bytes");
});

test("C-UPD-38 an incomplete snapshot is discarded without touching the original", () => {
  const { root, dest, replacement } = prior();
  chmodSync(join(dest, "SKILL.md"), 0o000);
  try {
    expect(() => replacement.snapshot()).toThrow("EACCES");
  } finally {
    chmodSync(join(dest, "SKILL.md"), 0o644);
  }
  expect(replacement.rollback()).toBeNull();
  replacement.cleanup();
  expect(readdirSync(root)).toEqual(["newbie"]);
  expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("prior bytes");
});

test("C-UPD-38 failed restoration retains and reports the complete backup", () => {
  const { root, dest, replacement } = prior();
  replacement.snapshot();
  writeFileSync(join(dest, "SKILL.md"), "replacement bytes");
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
  const { root, replacement } = prior();
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
  replacement.snapshot();
  writeFileSync(join(dest, "SKILL.md"), "success bytes");
  chmodSync(root, 0o555);
  try {
    expect(() => replacement.cleanup()).not.toThrow();
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe("success bytes");
  } finally {
    chmodSync(root, 0o755);
  }
  replacement.cleanup();
  expect(readdirSync(root)).toEqual(["newbie"]);
});
