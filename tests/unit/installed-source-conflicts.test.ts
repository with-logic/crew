/** C-UPD-18j: occupied locations reject different or unresolved sources (§5.4). */

import { expect, test } from "bun:test";
import type { Config, StateEntry, TapConfig } from "../../src/core/types.ts";
import {
  buildInstalledSourceIndex,
  indexHasSameSource,
  indexHasSourceConflict,
  noteInstalled,
} from "../../src/install/installed-lookup.ts";
import { collectAdditions } from "../../src/install/tap-reexpand/additions.ts";
import { makeTapScanCache } from "../../src/install/tap-reexpand/scan-cache.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const tap: TapConfig = {
  name: "broad",
  kind: "git",
  registered: true,
  url: "https://github.com/acme/skills.git",
  subpath: "",
  path: "",
};
const alias: TapConfig = {
  ...tap,
  name: "alias",
  url: "https://github.com/acme/skills",
  subpath: "skills/shared",
};
const config: Config = {
  taps: [tap, alias],
  disabled_agents: [],
  forced_agents: [],
  autoupdate: { enabled: false, interval_seconds: 14400 },
};
const lookup = {
  name: "shared",
  scope: "user" as const,
  projectRoot: null,
  tap,
  tapRelativePath: "skills/shared",
};

function entry(sourceTap: string, path: string): StateEntry {
  return {
    name: "shared",
    scope: "user",
    source: { tap: sourceTap, path },
    agents: ["claude-code"],
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:x",
    pinned: false,
    explicit: true,
    required_by: [],
    installed_at: "2026-01-01T00:00:00Z",
  };
}

test("C-UPD-18j missing configured tap reserves the install location", () => {
  const index = buildInstalledSourceIndex(
    { schema_version: 1, installations: [entry("removed", "skills/shared")] },
    config,
  );
  expect(indexHasSameSource(index, lookup)).toBe(false);
  expect(indexHasSourceConflict(index, lookup)).toBe(true);
});

test("C-UPD-18j mixed same and different sources remain a conflict", () => {
  const index = buildInstalledSourceIndex(
    {
      schema_version: 1,
      installations: [entry("broad", "skills/shared"), entry("broad", "other/shared")],
    },
    config,
  );
  expect(indexHasSameSource(index, lookup)).toBe(true);
  expect(indexHasSourceConflict(index, lookup)).toBe(true);
});

test("C-UPD-18j canonical source aliases do not conflict", () => {
  const index = buildInstalledSourceIndex(
    { schema_version: 1, installations: [entry("alias", "")] },
    config,
  );
  expect(indexHasSameSource(index, lookup)).toBe(true);
  expect(indexHasSourceConflict(index, lookup)).toBe(false);
});

test("C-UPD-18j different scope and project root remain independent", () => {
  const projectEntry = {
    ...entry("removed", "other"),
    scope: "project" as const,
    project_root: "/work/first",
  };
  const index = buildInstalledSourceIndex(
    { schema_version: 1, installations: [projectEntry] },
    config,
  );
  expect(indexHasSourceConflict(index, lookup)).toBe(false);
  expect(
    indexHasSourceConflict(index, { ...lookup, scope: "project", projectRoot: "/work/second" }),
  ).toBe(false);
  expect(
    indexHasSourceConflict(index, { ...lookup, scope: "project", projectRoot: "/work/first" }),
  ).toBe(true);
});

test("C-UPD-18j newly recorded foreign source conflicts within the same run", () => {
  const index = buildInstalledSourceIndex({ schema_version: 1, installations: [] }, config);
  expect(indexHasSourceConflict(index, lookup)).toBe(false);
  noteInstalled(index, { ...lookup, tapRelativePath: "other/shared" });
  expect(indexHasSourceConflict(index, lookup)).toBe(true);
});

test("C-UPD-18j a matching occupant does not hide another source in the same bucket", () => {
  const child = makeSkill(
    makeTempDir("crew-mixed-source-"),
    "shared",
    skillFrontmatter({ name: "shared" }),
  );
  const installed = entry("broad", "skills/shared");
  const installOne = () => ({ entry: installed, perTarget: [] });
  for (const installations of [[], [installed, entry("broad", "other/shared")]]) {
    const result = collectAdditions({
      children: [{ name: "shared", path: child, tapRelativePath: "skills/shared" }],
      conflictedNames: new Set(),
      memberNames: new Set(),
      scope: "user",
      tap,
      agents: installed.agents,
      resolvedSha: null,
      projectRoot: null,
      dryRun: false,
      ref: null,
      pinned: false,
      installOne,
      cache: makeTapScanCache(),
      installedIndex: buildInstalledSourceIndex({ schema_version: 1, installations }, config),
      namespaces: null,
    });
    if (installations.length === 0) expect(result.added).toEqual([installed]);
    else {
      expect(result.added).toEqual([]);
      expect(result.hardFailure).toBe(true);
      expect(result.rows[0]).toMatchObject({ kind: "tap_error", error: { code: "name_conflict" } });
    }
  }
});
