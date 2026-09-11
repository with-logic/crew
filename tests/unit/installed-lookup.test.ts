/**
 * Unit tests for the installed-source index (§5.4, §10.1.1).
 *
 * Re-expansion asks "is this child already installed from the same
 * canonical location, under any tap row?" once per candidate, so the
 * index must agree with a scan: same location matches, a sibling path
 * does not, and scope/project-root still partition entries.
 */

import { describe, expect, test } from "bun:test";
import type { Config, StateEntry, StateFile, TapConfig } from "../../src/core/types.ts";
import {
  buildInstalledSourceIndex,
  indexHasSameSource,
} from "../../src/install/installed-lookup.ts";

const broadTap: TapConfig = {
  name: "skills",
  kind: "git",
  registered: false,
  url: "https://github.com/acme/skills.git",
  subpath: "",
  path: "",
};

const narrowTap: TapConfig = {
  name: "skills-docx",
  kind: "git",
  registered: false,
  url: "https://github.com/acme/skills",
  subpath: "skills/docx",
  path: "",
};

function entry(over: Partial<StateEntry>): StateEntry {
  return {
    name: "docx",
    scope: "user",
    source: { tap: "skills", path: "skills/docx" },
    agents: ["claude-code"],
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:x",
    pinned: false,
    explicit: true,
    required_by: [],
    installed_at: "2026-01-01T00:00:00Z",
    ...over,
  } as StateEntry;
}

function stateOf(entries: readonly StateEntry[]): StateFile {
  return { schema_version: 1, installations: [...entries] };
}

const config: Config = {
  taps: [broadTap, narrowTap],
  disabled_agents: [],
  forced_agents: [],
  autoupdate: { enabled: false, interval_seconds: 14400 },
};

describe("installed source index", () => {
  test("matches the same location reached through another tap row", () => {
    const index = buildInstalledSourceIndex(stateOf([entry({})]), config);
    // Installed via the broad tap; asked about the narrow one. Same
    // directory in the same repo, so it is already here.
    expect(
      indexHasSameSource(index, {
        name: "docx",
        scope: "user",
        projectRoot: null,
        tap: narrowTap,
        tapRelativePath: "",
      }),
    ).toBe(true);
  });

  test("a sibling path in the same repo is not the same source", () => {
    const index = buildInstalledSourceIndex(stateOf([entry({})]), config);
    expect(
      indexHasSameSource(index, {
        name: "docx",
        scope: "user",
        projectRoot: null,
        tap: broadTap,
        tapRelativePath: "skills/pdf",
      }),
    ).toBe(false);
  });

  test("scope and project root partition entries", () => {
    const index = buildInstalledSourceIndex(
      stateOf([entry({ scope: "project", project_root: "/work/a" })]),
      config,
    );
    const base = { name: "docx", tap: broadTap, tapRelativePath: "skills/docx" } as const;
    expect(indexHasSameSource(index, { ...base, scope: "project", projectRoot: "/work/a" })).toBe(
      true,
    );
    expect(indexHasSameSource(index, { ...base, scope: "project", projectRoot: "/work/b" })).toBe(
      false,
    );
    expect(indexHasSameSource(index, { ...base, scope: "user", projectRoot: null })).toBe(false);
  });

  test("an unknown name and an entry on a missing tap never match", () => {
    const index = buildInstalledSourceIndex(stateOf([entry({})]), config);
    expect(
      indexHasSameSource(index, {
        name: "absent",
        scope: "user",
        projectRoot: null,
        tap: broadTap,
        tapRelativePath: "skills/docx",
      }),
    ).toBe(false);

    // An entry whose tap left config can't be resolved, so it is skipped
    // when the index is built.
    const orphaned = buildInstalledSourceIndex(
      stateOf([entry({ source: { tap: "gone", path: "skills/docx" } })]),
      config,
    );
    expect(orphaned.byName.get("docx")).toBeUndefined();
  });
});
