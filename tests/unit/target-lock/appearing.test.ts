/** A base skipped by preparation must not expose a later install to unlocked writes (§14). */
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { installSkillIntoAgents } from "../../../src/agents/install.ts";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { withTargetLocks } from "../../../src/agents/target-lock/index.ts";
import { uninstallSkillFromAgents } from "../../../src/agents/uninstall.ts";
import { rewriteReattributedMarkers } from "../../../src/install/reattribute.ts";
import { rewriteTapMarkers } from "../../../src/install/rewrite-tap-markers.ts";
import { stageIntoStore } from "../../../src/sources/store.ts";
import { acquireLock } from "../../../src/util/advisory-lock.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
}));
afterEach(() => {
  for (const { adapter, userPath, projectPath } of originals) {
    adapter.userPath = userPath;
    adapter.projectPath = projectPath;
  }
});
function input(base: string) {
  const home = makeCrewHome();
  const source = makeSkill(
    makeTempDir(),
    "demo",
    skillFrontmatter({ name: "demo" }),
    "later bytes",
  );
  const staged = stageIntoStore(source, "demo", null, home);
  for (const adapter of ALL_AGENTS) {
    const userBase =
      adapter === claudeCodeAdapter ? base : join(home, "isolated-users", adapter.name);
    adapter.userPath = () => userBase;
    adapter.projectPath = () => join(dirname(base), "isolated-projects", adapter.name);
  }
  return {
    agents: [claudeCodeAdapter],
    scope: "user" as const,
    cwd: dirname(base),
    storePath: staged.storePath,
    skillName: "demo",
    tap: {
      name: "fixture",
      kind: "path" as const,
      path: source,
      registered: true,
      url: "",
      subpath: "",
    },
    tapRelativePath: ".",
    ref: null,
    resolvedSha: null,
    contentHash: staged.contentHash,
    force: false,
  };
}

for (const force of [false, true]) {
  test(`C-CONC-07 an absent removal base stays missing for its prepared batch (force=${force})`, () => {
    const base = join(makeTempDir(), "missing");
    const args = input(base);
    withTargetLocks(
      [{ path: base, create: false }],
      (_failures, unavailableBases?: ReadonlySet<string>) => {
        installSkillIntoAgents(args);
        const bytes = readFileSync(join(base, "demo", ".crew.json"));
        const remove = () =>
          uninstallSkillFromAgents({
            agents: args.agents,
            scope: args.scope,
            cwd: args.cwd,
            skillName: "demo",
            force,
            dryRun: false,
            ...(unavailableBases ? { unavailableBases } : {}),
          });
        if (force) expect(remove()).toEqual({ kind: "absent" });
        else expect(remove).toThrow("isn't installed");
        expect(readFileSync(join(base, "demo", ".crew.json"))).toEqual(bytes);
      },
    );
  });
}

test("C-CONC-07 marker rewrite inventories omit bases that appeared after preparation", () => {
  const base = join(makeTempDir(), "missing");
  const args = input(base);
  withTargetLocks(
    [{ path: base, create: false }],
    (_failures, unavailableBases?: ReadonlySet<string>) => {
      installSkillIntoAgents(args);
      const marker = join(base, "demo", ".crew.json");
      const bytes = readFileSync(marker);
      rewriteTapMarkers({ oldName: "fixture", newName: "renamed" }, [], args.cwd, unavailableBases);
      expect(readFileSync(marker)).toEqual(bytes);
      rewriteReattributedMarkers(
        [
          {
            name: "demo",
            scope: "user",
            projectRoot: null,
            fromTap: "fixture",
            toTap: "renamed",
            toPath: "demo",
            tracksTap: true,
          },
        ],
        [{ ...args.tap, name: "renamed" }],
        args.cwd,
        unavailableBases,
      );
      expect(readFileSync(marker)).toEqual(bytes);
    },
  );
});

test("C-CONC-07 a non-directory install base cannot become a later unlocked install", () => {
  const base = join(makeTempDir(), "file");
  writeFileSync(base, "not a directory");
  const args = input(base);
  withTargetLocks([{ path: base, create: true }], (baseFailures) => {
    rmSync(base);
    expect(() => installSkillIntoAgents({ ...args, baseFailures })).toThrow("EEXIST");
    expect(existsSync(join(base, "demo"))).toBe(false);
  });
});

test("C-CONC-07 an unavailable base cannot become an unlocked install after recreation", () => {
  const base = join(makeTempDir(), "missing");
  const args = input(base);
  withTargetLocks([{ path: base, create: false }], (baseFailures, unavailableBases) => {
    expect(unavailableBases.has(base)).toBe(true);
    // Recreate the install under a different batch, then retain its physical lock.
    withTargetLocks([{ path: base, create: true }], (failures) =>
      installSkillIntoAgents({ ...args, baseFailures: failures }),
    );
    const marker = join(base, "demo", ".crew.json");
    const bytes = readFileSync(marker);
    const held = acquireLock(join(base, ".crew-target"));
    try {
      expect(() => installSkillIntoAgents({ ...args, force: true, baseFailures })).toThrow(
        "unavailable during target preparation",
      );
      expect(readFileSync(marker)).toEqual(bytes);
      expect(existsSync(join(base, ".crew-target.lock"))).toBe(true);
    } finally {
      held.release();
    }
  });
});
