/** C-UPD-18k: cleanup errors preserve installed state and report recovery paths (§10.1.1). */

import { expect, test } from "bun:test";
import type { StateEntry, TapConfig } from "../../src/core/types.ts";
import { buildInstalledSourceIndex } from "../../src/install/installed-lookup.ts";
import { collectAdditions } from "../../src/install/tap-reexpand/additions.ts";
import { makeTapScanCache } from "../../src/install/tap-reexpand/scan-cache.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

test("C-UPD-18k installed child is retained when rollback backup cleanup fails", () => {
  const root = makeTempDir("crew-cleanup-result-");
  const child = makeSkill(root, "child", skillFrontmatter({ name: "child" }));
  const tap: TapConfig = {
    name: "local",
    kind: "path",
    registered: true,
    path: root,
    url: "",
    subpath: "",
  };
  const entry: StateEntry = {
    name: "child",
    source: { tap: tap.name, path: "child" },
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:x",
    scope: "user",
    installed_at: "2026-01-01T00:00:00Z",
    agents: ["claude-code", "codex"],
    pinned: false,
    explicit: true,
    tracks_tap: true,
    required_by: [],
  };
  const cleanupError = {
    code: "source_unreachable",
    message: `Could not remove rollback backup ${root}/.backup: EACCES`,
  };
  const perTarget = [
    { agent: "claude-code", kind: "installed" as const, cleanup_error: cleanupError },
    { agent: "codex", kind: "up_to_date" as const },
  ];
  const installedIndex = buildInstalledSourceIndex(
    { schema_version: 1, installations: [] },
    {
      taps: [tap],
      disabled_agents: [],
      forced_agents: [],
      autoupdate: { enabled: false, interval_seconds: 14400 },
    },
  );
  const result = collectAdditions({
    children: [{ name: "child", path: child, tapRelativePath: "child" }],
    conflictedNames: new Set(),
    memberNames: new Set(),
    scope: "user",
    tap,
    agents: entry.agents,
    resolvedSha: null,
    projectRoot: null,
    dryRun: false,
    ref: null,
    pinned: false,
    installOne: () => ({ entry, perTarget }),
    cache: makeTapScanCache(),
    installedIndex,
    namespaces: null,
  });
  expect(result.added).toEqual([entry]);
  expect(result.hardFailure).toBe(true);
  expect(result.rows).toEqual([
    { name: "child", scope: "user", tap: "local", kind: "added", per_target: perTarget },
    {
      name: "child",
      scope: "user",
      tap: "local",
      kind: "tap_error",
      error: { code: cleanupError.code, message: `Installed child, but ${cleanupError.message}` },
    },
  ]);
});
