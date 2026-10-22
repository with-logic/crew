/** Base discovery uses adapters and valid recorded project roots, never marker paths (§14). */
import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import {
  adapterTargetBases,
  entryTargetBases,
  markerTargetBases,
} from "../../../src/agents/target-lock/bases.ts";
import type { StateEntry } from "../../../src/core/types.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
}));
afterEach(() => {
  for (const { adapter, userPath, projectPath } of originals)
    Object.assign(adapter, { userPath, projectPath });
});
function entry(overrides: Partial<StateEntry> = {}): StateEntry {
  return {
    name: "demo",
    source: { tap: "fixture", path: "." },
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:fixture",
    scope: "user",
    installed_at: "2026-01-01T00:00:00Z",
    agents: ["claude-code"],
    pinned: false,
    explicit: true,
    required_by: [],
    ...overrides,
  };
}

test("C-CONC-06 base discovery skips unsupported adapters and invalid roots without guessing", () => {
  const user = makeTempDir();
  const cwd = makeTempDir();
  const project = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => (adapter.name === "nanobot" ? "" : user);
    adapter.projectPath = (root) => join(root, "skills");
  }
  const records = [
    entry(),
    entry({ scope: "project", project_root: project }),
    entry({ scope: "project", project_root: "relative" }),
    entry({ agents: ["unknown"] }),
  ];
  expect(entryTargetBases(records, cwd, false)).toEqual([
    { path: user, create: false },
    { path: join(project, "skills"), create: false },
  ]);
  expect(adapterTargetBases(ALL_AGENTS, "user", cwd, true)).toHaveLength(ALL_AGENTS.length - 1);
  const markers = markerTargetBases(records, cwd);
  expect(markers).toContainEqual({ path: join(cwd, "skills"), create: false });
  expect(markers).toContainEqual({ path: join(project, "skills"), create: false });
  expect(markers).not.toContainEqual({ path: join("relative", "skills"), create: false });
});
