/** Marker rewrites use cwd and usable retained project roots only (§11.1, §16.3). */
import { afterEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../src/agents/registry.ts";
import type { Marker, StateEntry } from "../../src/core/types.ts";
import { hashDirectory } from "../../src/hash/content.ts";
import { rewriteTapMarkers } from "../../src/install/rewrite-tap-markers.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
}));
afterEach(() => {
  for (const { adapter, userPath, projectPath } of originals)
    Object.assign(adapter, { userPath, projectPath });
});

test("tap marker rewrites leave corrupt relative project roots untouched while preserving valid locations", () => {
  const root = makeTempDir("crew-marker-roots-");
  const cwd = makeTempDir("crew-marker-cwd-");
  const project = makeTempDir("crew-marker-project-");
  const projectLocations = new Map([
    ["relative", "corrupt"],
    [cwd, "cwd"],
    [project, "retained"],
  ]);
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(root, "user", adapter.name);
    adapter.projectPath = (location) => join(root, projectLocations.get(location)!, adapter.name);
  }
  const markers = new Map<string, string>();
  for (const location of ["user", "cwd", "retained", "corrupt"]) {
    const skill = makeSkill(
      join(root, location, "claude-code"),
      "demo",
      skillFrontmatter({ name: "demo" }),
      `${location} bytes`,
    );
    const marker: Marker = {
      schema_version: 1,
      name: "demo",
      agents: ["claude-code"],
      tap_name: "fixture",
      tap_kind: "path",
      tap_url: "",
      tap_subpath: "",
      tap_path: root,
      path: "demo",
      ref: null,
      resolved_sha: null,
      content_hash: hashDirectory(skill),
      scope: location === "user" ? "user" : "project",
      installed_at: "2026-01-01T00:00:00Z",
      installed_by: "crew test",
    };
    const path = join(skill, ".crew.json");
    writeFileSync(path, JSON.stringify(marker));
    markers.set(location, path);
  }
  const entry: StateEntry = {
    name: "demo",
    source: { tap: "fixture", path: "demo" },
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:fixture",
    scope: "project",
    project_root: "relative",
    installed_at: "2026-01-01T00:00:00Z",
    agents: ["claude-code"],
    pinned: false,
    explicit: true,
    required_by: [],
  };
  const corrupt = markers.get("corrupt")!;
  const before = readFileSync(corrupt);
  rewriteTapMarkers(
    { oldName: "fixture", newName: "renamed" },
    [entry, { ...entry, project_root: project }],
    cwd,
  );
  expect(readFileSync(corrupt)).toEqual(before);
  for (const location of ["user", "cwd", "retained"])
    expect(JSON.parse(readFileSync(markers.get(location)!, "utf8")).tap_name).toBe("renamed");
});
