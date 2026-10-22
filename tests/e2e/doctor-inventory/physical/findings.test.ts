/** Cached strict findings retain each lexical alias and its accessibility (§11.2, C-STATE-14). */
import { afterEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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

test("C-STATE-14 unowned malformed and unreadable entries keep every alias diagnostic", () => {
  const base = makeTempDir();
  const alias = join(makeTempDir(), "alias-$&");
  symlinkSync(base, alias, "dir");
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => base;
    adapter.projectPath = () => "";
  }
  claudeCodeAdapter.userPath = () => alias;
  for (const name of ["malformed", "unreadable"]) {
    const skill = makeSkill(base, name, skillFrontmatter({ name }));
    writeFileSync(join(skill, ".crew.json"), "{broken");
  }
  const unreadable = join(base, "unreadable", ".crew.json");
  chmodSync(unreadable, 0);
  try {
    const inventory = buildMarkerIndex([], makeTempDir());
    expect(inventory.markers).toEqual([]);
    expect(inventory.findings).toHaveLength(4);
    for (const [root, name, code] of [
      [base, "malformed", "marker_invalid"],
      [alias, "malformed", "marker_invalid"],
      [base, "unreadable", "marker_unreadable"],
      [alias, "unreadable", "marker_unreadable"],
    ] as const) {
      const path = join(root, name, ".crew.json");
      expect(
        inventory.findings.filter((finding) => finding.message.startsWith(`${path}: `)),
      ).toEqual([expect.objectContaining({ level: "error", code })]);
    }
    const aliasedError = inventory.findings.find((finding) =>
      finding.message.startsWith(`${join(alias, "unreadable", ".crew.json")}: `),
    )!;
    expect(aliasedError.message).not.toContain(unreadable);
  } finally {
    chmodSync(unreadable, 0o600);
  }
});

test("C-STATE-14 a cached accessible base does not hide an inaccessible lexical alias", () => {
  const home = makeCrewHome();
  const cwd = makeTempDir();
  const base = makeTempDir();
  const parent = makeTempDir();
  const alias = join(parent, "alias");
  symlinkSync(base, alias, "dir");
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => base;
    adapter.projectPath = () => "";
    adapter.detect = () => adapter.name === "claude-code";
  }
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  expect(
    runCli(["install", source, "--agent", "claude-code"], {
      home,
      cwd,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const state = readState(home);
  const before = readFileSync(join(home, "state.json"));
  claudeCodeAdapter.userPath = () => alias;
  chmodSync(parent, 0);
  try {
    const inventory = buildMarkerIndex(state.installations, cwd);
    expect(inventory.markers).toEqual([]);
    expect(inventory.findings).toEqual([
      expect.objectContaining({
        level: "error",
        code: "marker_unreadable",
        message: expect.stringContaining(alias),
      }),
    ]);
    expect(readFileSync(join(home, "state.json"))).toEqual(before);
  } finally {
    chmodSync(parent, 0o755);
  }
});
