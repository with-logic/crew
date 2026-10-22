/** Physical aliases, failure unwind and captured preparation errors use real files (§14). */
import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { installSkillIntoAgents } from "../../../src/agents/install.ts";
import { withTargetLocks } from "../../../src/agents/target-lock/index.ts";
import { stageIntoStore } from "../../../src/sources/store.ts";
import { acquireLock } from "../../../src/util/advisory-lock.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const original = claudeCodeAdapter.userPath;
afterEach(() => {
  claudeCodeAdapter.userPath = original;
});

test("C-CONC-06 duplicate and symlink-base aliases take one lock", () => {
  const base = makeTempDir();
  const alias = join(makeTempDir(), "alias");
  symlinkSync(base, alias);
  const requests = [
    { path: base, create: false },
    { path: base, create: true },
    { path: alias, create: true },
  ];
  withTargetLocks(requests, (failures) => {
    expect(failures.size).toBe(0);
    expect(existsSync(join(base, ".crew-target.lock"))).toBe(true);
  });
  expect(existsSync(join(base, ".crew-target.lock"))).toBe(false);
  expect(withTargetLocks([], (failures) => failures.size)).toBe(0);
});

test("C-CONC-08 every earlier lock releases when a later acquisition fails", () => {
  const bases = [makeTempDir(), makeTempDir()].sort((a, b) =>
    Number(statSync(a).ino - statSync(b).ino),
  );
  const operationFailure = () => {
    throw new Error("operation failure");
  };
  const held = acquireLock(join(bases[1]!, ".crew-target"));
  const previous = process.env["CREW_LOCK_TIMEOUT_MS"];
  process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
  try {
    expect(() =>
      withTargetLocks(
        bases.map((path) => ({ path, create: false })),
        operationFailure,
      ),
    ).toThrow("another crew process");
    expect(existsSync(join(bases[0]!, ".crew-target.lock"))).toBe(false);
  } finally {
    if (previous === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
    else process.env["CREW_LOCK_TIMEOUT_MS"] = previous;
    held.release();
  }
  expect(() =>
    withTargetLocks(
      bases.map((path) => ({ path, create: true })),
      operationFailure,
    ),
  ).toThrow("operation failure");
  for (const base of bases) expect(existsSync(join(base, ".crew-target.lock"))).toBe(false);
});

test("C-CONC-09 absent read-only bases and non-directory bases create no artifacts", () => {
  const root = makeTempDir();
  const missing = join(root, "missing");
  const file = join(root, "file");
  writeFileSync(file, "not a directory");
  withTargetLocks(
    [
      { path: missing, create: false },
      { path: file, create: false },
      { path: join(file, "child"), create: false },
    ],
    (failures) => {
      expect(failures.size).toBe(3);
      for (const path of [missing, file, join(file, "child")])
        expect(failures.get(path)?.code).toBe("usage_error");
    },
  );
  expect(existsSync(missing)).toBe(false);
  withTargetLocks([{ path: missing, create: true }], () => {
    expect(existsSync(join(missing, ".crew-target.lock"))).toBe(true);
  });
});

test("C-CONC-07 failed absent-base creation cannot become a later unlocked install", () => {
  const home = makeCrewHome();
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  const staged = stageIntoStore(source, "demo", null, home);
  const root = makeTempDir();
  const missing = join(root, "missing");
  claudeCodeAdapter.userPath = () => missing;
  chmodSync(root, 0o555);
  try {
    withTargetLocks([{ path: missing, create: true }], (baseFailures) => {
      expect(baseFailures.get(missing)?.code).toBe("EACCES");
      chmodSync(root, 0o755);
      mkdirSync(missing);
      expect(() =>
        installSkillIntoAgents({
          agents: [claudeCodeAdapter],
          scope: "user",
          cwd: root,
          storePath: staged.storePath,
          skillName: "demo",
          tap: {
            name: "fixture",
            kind: "path",
            registered: true,
            path: source,
            url: "",
            subpath: "",
          },
          tapRelativePath: ".",
          ref: null,
          resolvedSha: null,
          contentHash: staged.contentHash,
          force: false,
          baseFailures,
        }),
      ).toThrow("EACCES");
      expect(existsSync(join(missing, "demo"))).toBe(false);
    });
  } finally {
    chmodSync(root, 0o755);
  }
});

test("C-CONC-08 existing directory access failures are never omitted", () => {
  const root = makeTempDir();
  const base = join(root, "base");
  mkdirSync(base);
  chmodSync(root, 0o000);
  try {
    expect(() => withTargetLocks([{ path: base, create: true }], Number)).toThrow("EACCES");
  } finally {
    chmodSync(root, 0o755);
  }
  chmodSync(base, 0o555);
  try {
    expect(() => withTargetLocks([{ path: base, create: false }], Number)).toThrow("EACCES");
  } finally {
    chmodSync(base, 0o755);
  }
});
