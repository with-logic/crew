/** Backup and restore failures remain observable without losing state (§10.1.1). */

import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import {
  discardSnapshots,
  rollbackTargets,
  snapshotTarget,
} from "../../src/install/install-new-tap-child/transaction.ts";
import type { NewChildTargetResult } from "../../src/install/tap-reexpand/types.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

test("C-UPD-18k backup cleanup failure keeps success and reports the retained path", () => {
  const root = makeTempDir("crew-backup-cleanup-");
  const dest = join(root, "newbie");
  mkdirSync(dest);
  writeFileSync(join(dest, "old"), "original\n");
  const snapshot = snapshotTarget(dest, [claudeCodeAdapter]);
  const snapshots = new Map([[dest, snapshot]]);
  const perTarget: NewChildTargetResult[] = [{ agent: "claude-code", kind: "installed" }];
  chmodSync(root, 0o555);
  try {
    discardSnapshots(snapshots, perTarget);
    expect(perTarget).toMatchObject([
      { agent: "claude-code", kind: "installed", cleanup_error: { code: "source_unreachable" } },
    ]);
    const target = perTarget[0]!;
    expect("cleanup_error" in target && target.cleanup_error?.message).toContain(snapshot.backup!);
    expect(existsSync(snapshot.backup!)).toBe(true);
    expect(readFileSync(join(dest, "old"), "utf8")).toBe("original\n");
  } finally {
    chmodSync(root, 0o755);
  }
});

test("C-UPD-18i restore failure preserves both the target error and recovery path", () => {
  const root = makeTempDir("crew-backup-restore-");
  const dest = join(root, "newbie");
  mkdirSync(dest);
  writeFileSync(join(dest, "body"), "original\n");
  const snapshot = snapshotTarget(dest, [claudeCodeAdapter]);
  writeFileSync(join(dest, "body"), "changed before install failed\n");
  const perTarget: NewChildTargetResult[] = [
    {
      agent: "claude-code",
      kind: "failed",
      error: { code: "customized", message: "original error" },
    },
  ];
  chmodSync(root, 0o555);
  try {
    rollbackTargets(new Map([[dest, snapshot]]), perTarget);
    expect(perTarget[0]).toMatchObject({ kind: "failed", error: { code: "customized" } });
    const target = perTarget[0]!;
    expect(target.kind === "failed" && target.error.message).toContain("original error;");
    expect(target.kind === "failed" && target.error.message).toContain(snapshot.backup!);
    expect(readFileSync(join(snapshot.backup!, "original", "body"), "utf8")).toBe("original\n");
  } finally {
    chmodSync(root, 0o755);
  }
});

test("C-UPD-18i a partially modified failed target is restored without replacing its error", () => {
  const root = makeTempDir("crew-backup-own-failure-");
  const dest = join(root, "newbie");
  mkdirSync(dest);
  writeFileSync(join(dest, "body"), "original\n");
  const snapshot = snapshotTarget(dest, [claudeCodeAdapter]);
  writeFileSync(join(dest, "body"), "partial replacement\n");
  const perTarget: NewChildTargetResult[] = [
    {
      agent: "claude-code",
      kind: "failed",
      error: { code: "source_unreachable", message: "disk full" },
    },
  ];
  rollbackTargets(new Map([[dest, snapshot]]), perTarget);
  expect(perTarget[0]).toMatchObject({
    kind: "failed",
    error: { code: "source_unreachable", message: "disk full" },
  });
  expect(readFileSync(join(dest, "body"), "utf8")).toBe("original\n");
  expect(readdirSync(root)).toEqual(["newbie"]);
});

test("C-UPD-18i an incomplete snapshot never replaces its untouched destination", () => {
  const root = makeTempDir("crew-backup-incomplete-");
  const dest = join(root, "newbie");
  mkdirSync(dest);
  writeFileSync(join(dest, "body"), "original\n");
  chmodSync(dest, 0o111);
  try {
    expect(() => snapshotTarget(dest, [claudeCodeAdapter])).toThrow();
    expect(existsSync(join(dest, "body"))).toBe(true);
  } finally {
    chmodSync(dest, 0o755);
    for (const name of readdirSync(root)) {
      if (!name.startsWith(".crew-backup-")) continue;
      const original = join(root, name, "original");
      if (existsSync(original)) chmodSync(original, 0o755);
    }
  }
  expect(readFileSync(join(dest, "body"), "utf8")).toBe("original\n");
});

test("C-UPD-18i incomplete snapshot cleanup errors report the retained partial backup", () => {
  const root = makeTempDir("crew-backup-partial-cleanup-");
  const dest = join(root, "newbie");
  const readonlyDir = join(dest, "a-readonly");
  mkdirSync(readonlyDir, { recursive: true });
  writeFileSync(join(readonlyDir, "body"), "original\n");
  chmodSync(readonlyDir, 0o555);
  const unreadable = join(dest, "z-unreadable");
  writeFileSync(unreadable, "cannot copy\n", { mode: 0o000 });
  try {
    expect(() => snapshotTarget(dest, [claudeCodeAdapter])).toThrow("partial backup");
    expect(readFileSync(join(readonlyDir, "body"), "utf8")).toBe("original\n");
  } finally {
    chmodSync(readonlyDir, 0o755);
    chmodSync(unreadable, 0o600);
    for (const name of readdirSync(root)) {
      if (!name.startsWith(".crew-backup-")) continue;
      const copied = join(root, name, "original", "a-readonly");
      if (existsSync(copied)) chmodSync(copied, 0o755);
    }
  }
});

test("C-UPD-18i a destination symlink is restored as a link without copying its target", () => {
  const root = makeTempDir("crew-backup-root-link-");
  const outside = makeTempDir("crew-backup-root-target-");
  writeFileSync(join(outside, "body"), "outside\n");
  const dest = join(root, "newbie");
  symlinkSync(outside, dest);
  const snapshot = snapshotTarget(dest, [claudeCodeAdapter]);
  expect(readlinkSync(join(snapshot.backup!, "original"))).toBe(outside);
  unlinkSync(dest);
  mkdirSync(dest);
  writeFileSync(join(dest, "replacement"), "changed\n");
  const perTarget: NewChildTargetResult[] = [{ agent: "claude-code", kind: "installed" }];
  rollbackTargets(new Map([[dest, snapshot]]), perTarget);
  expect(readlinkSync(dest)).toBe(outside);
  expect(readFileSync(join(outside, "body"), "utf8")).toBe("outside\n");
});
