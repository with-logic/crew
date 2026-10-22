/** Install-only admission failures stay frozen across aliases without unlocked reads (§14). */
import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { installSkillIntoAgents } from "../../../src/agents/install.ts";
import { withTargetLocks } from "../../../src/agents/target-lock/index.ts";
import type { TapConfig } from "../../../src/core/types.ts";
import { assertChildSourceOwnership } from "../../../src/install/tap-reexpand/ownership.ts";
import { installLocationKey } from "../../../src/state/identity.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const original = claudeCodeAdapter.userPath;
afterEach(() => {
  claudeCodeAdapter.userPath = original;
});

for (const sentinelExists of [false, true]) {
  test(`C-CONC-07 install admission freezes all aliases until retry (sentinel=${sentinelExists})`, () => {
    const base = makeTempDir();
    const alias = join(makeTempDir(), "alias");
    symlinkSync(base, alias);
    claudeCodeAdapter.userPath = () => alias;
    const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    const tap: TapConfig = {
      name: "fixture",
      kind: "path",
      registered: true,
      path: source,
      url: "",
      subpath: "",
    };
    const lookup = {
      name: "demo",
      scope: "user" as const,
      projectRoot: null,
      tap,
      tapRelativePath: ".",
    };
    const install = {
      agents: [claudeCodeAdapter],
      scope: "user" as const,
      cwd: base,
      storePath: source,
      skillName: "demo",
      tap,
      tapRelativePath: ".",
      ref: null,
      resolvedSha: null,
      contentHash: "fixture",
      force: false,
    };
    const marker = join(base, "demo", ".crew.json");
    mkdirSync(join(base, "demo"));
    writeFileSync(marker, "malformed marker: ownership inspection must not run");
    if (sentinelExists) writeFileSync(join(base, ".crew-target"), "");
    chmodSync(base, 0o555);
    try {
      withTargetLocks(
        [
          { path: base, create: true },
          { path: alias, create: true },
        ],
        (failures, unavailable) => {
          expect(failures.size).toBe(2);
          expect(failures.get(base)?.code).toBe("EACCES");
          expect(failures.get(alias)).toBe(failures.get(base));
          expect(unavailable.size).toBe(0);
          expect(existsSync(join(base, ".crew-target.lock"))).toBe(false);
          chmodSync(base, 0o755);
          assertChildSourceOwnership({ byLocation: new Map() }, lookup, ["claude-code"], failures);
          expect(() => installSkillIntoAgents({ ...install, baseFailures: failures })).toThrow(
            "EACCES",
          );
          expect(readFileSync(marker, "utf8")).toBe(
            "malformed marker: ownership inspection must not run",
          );
          const stateConflict = {
            byLocation: new Map([[installLocationKey("demo", "user", null), [null]]]),
          };
          expect(() =>
            assertChildSourceOwnership(stateConflict, lookup, ["claude-code"], failures),
          ).toThrow("Cannot add");
        },
      );
    } finally {
      chmodSync(base, 0o755);
    }
    withTargetLocks([{ path: alias, create: true }], (failures) => {
      expect(failures.size).toBe(0);
      expect(() =>
        assertChildSourceOwnership({ byLocation: new Map() }, lookup, ["claude-code"], failures),
      ).toThrow("Cannot add");
      rmSync(join(base, "demo"), { recursive: true });
      assertChildSourceOwnership({ byLocation: new Map() }, lookup, ["claude-code"], failures);
      expect(installSkillIntoAgents({ ...install, baseFailures: failures }).kind).toBe("installed");
    });
    expect(JSON.parse(readFileSync(marker, "utf8")).agents).toEqual(["claude-code"]);
  });
}

for (const useAlias of [false, true]) {
  test(`C-CONC-08 metadata intent remains strict beside an install (alias=${useAlias})`, () => {
    const base = makeTempDir();
    const alias = join(makeTempDir(), "alias");
    symlinkSync(base, alias);
    writeFileSync(join(base, ".crew-target"), "");
    chmodSync(base, 0o555);
    let called = false;
    try {
      expect(() =>
        withTargetLocks(
          [
            { path: base, create: true },
            { path: useAlias ? alias : base, create: false },
          ],
          () => {
            called = true;
          },
        ),
      ).toThrow("EACCES");
      expect(called).toBe(false);
    } finally {
      chmodSync(base, 0o755);
    }
  });
}

test("C-CONC-08 owner publication permission failures stay fatal for install bases", () => {
  const base = makeTempDir();
  const owner = join(base, ".crew-target.lock.owner");
  writeFileSync(owner, "prior owner record");
  chmodSync(owner, 0o444);
  let called = false;
  try {
    expect(() =>
      withTargetLocks([{ path: base, create: true }], () => {
        called = true;
      }),
    ).toThrow("EACCES");
    expect(called).toBe(false);
    expect(existsSync(join(base, ".crew-target.lock"))).toBe(false);
    expect(readFileSync(owner, "utf8")).toBe("prior owner record");
  } finally {
    chmodSync(owner, 0o644);
  }
});

test("C-CONC-08 owner inspection permission failures stay fatal for install bases", () => {
  const base = makeTempDir();
  const owner = join(base, ".crew-target.lock.owner");
  writeFileSync(join(base, ".crew-target"), "");
  mkdirSync(join(base, ".crew-target.lock"));
  writeFileSync(owner, "unreadable owner record");
  chmodSync(owner, 0o000);
  let called = false;
  try {
    expect(() =>
      withTargetLocks([{ path: base, create: true }], () => {
        called = true;
      }),
    ).toThrow("EACCES");
    expect(called).toBe(false);
    expect(existsSync(join(base, ".crew-target.lock"))).toBe(true);
  } finally {
    chmodSync(owner, 0o644);
  }
});
