/** Shared physical inventories retain every logical owner/root observation (§7.2, §11.2). */
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../../src/agents/claude-code.ts";
import { ALL_AGENTS } from "../../../../src/agents/registry.ts";
import { runCli } from "../../../../src/cli/main.ts";
import { buildMarkerIndex } from "../../../../src/commands/doctor/markers/index.ts";
import { readState } from "../../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
});

for (const scope of ["user", "project"] as const) {
  test(`C-STATE-06 ${scope} physical sharing preserves disjoint later owners and lexical aliases`, () => {
    const home = makeCrewHome();
    const project = makeTempDir();
    const projectAlias = join(makeTempDir(), "project-alias");
    const base = join(project, "skills");
    const baseAlias = join(makeTempDir(), "base-alias");
    const missingRoot = join(makeTempDir(), "missing-project");
    mkdirSync(base);
    symlinkSync(project, projectAlias, "dir");
    symlinkSync(base, baseAlias, "dir");
    for (const adapter of ALL_AGENTS) {
      adapter.userPath = () => (scope === "user" ? base : "");
      adapter.projectPath = (root) => (scope === "project" ? join(root, "skills") : "");
      adapter.detect = () => ["claude-code", "codex"].includes(adapter.name);
    }
    if (scope === "user") claudeCodeAdapter.userPath = () => baseAlias;
    expect(ALL_AGENTS[0]!.name).toBe("agent-skills");
    for (const [name, owner] of [
      ["alpha", "claude-code"],
      ["beta", "codex"],
    ] as const) {
      const source = makeSkill(makeTempDir(), name, skillFrontmatter({ name }));
      expect(
        runCli(["install", source, "--agent", owner, "--scope", scope], {
          home,
          cwd: project,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
    }
    const paths = [
      join(home, "state.json"),
      ...["alpha", "beta"].map((name) => join(base, name, ".crew.json")),
    ];
    const before = paths.map((path) => readFileSync(path));
    const state = readState(home);
    const inventory = buildMarkerIndex(state.installations, project, [projectAlias, missingRoot]);
    expect(inventory.projectRoots).toEqual([project, projectAlias, missingRoot]);
    expect(inventory.findings).toEqual([]);
    const actual = inventory.markers.map((entry) => ({
      name: entry.record.marker.name,
      adapter: entry.record.adapter,
      scope: entry.record.scope,
      path: entry.record.installDir,
      root: entry.projectRoot ?? null,
      owners: entry.record.marker.agents,
    }));
    const expected: typeof actual = [];
    for (const [name, owner] of [
      ["alpha", "claude-code"],
      ["beta", "codex"],
    ] as const) {
      for (const root of scope === "user" ? [null] : [project, projectAlias]) {
        expected.push({
          name,
          adapter: owner,
          scope,
          path: join(
            root === null ? (owner === "claude-code" ? baseAlias : base) : join(root, "skills"),
            name,
          ),
          root,
          owners: [owner],
        });
      }
    }
    expect(actual).toEqual(expected);
    expect(paths.map((path) => readFileSync(path))).toEqual(before);
  });
}
