/** Owned rollback cleanup failures remain visible without changing child outcomes (§10.1.1). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import type { Config, StateEntry } from "../../../src/core/types.ts";
import { installNewTapChild } from "../../../src/install/new-tap-child/index.ts";
import { reexpandTaps } from "../../../src/install/tap-reexpand/index.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originalClaude = claudeCodeAdapter.userPath;
const originalCodex = codexAdapter.userPath;
afterEach(() => {
  claudeCodeAdapter.userPath = originalClaude;
  codexAdapter.userPath = originalCodex;
});

for (const fail of [false, true]) {
  test(`C-UPD-38 cleanup diagnostic preserves a ${fail ? "failed" : "successful"} child outcome`, () => {
    const home = makeCrewHome();
    const source = makeTempDir();
    makeSkill(source, "alpha", skillFrontmatter({ name: "alpha" }));
    makeSkill(source, "newbie", skillFrontmatter({ name: "newbie" }), "new bytes");
    const root = makeTempDir();
    const codexRoot = makeTempDir();
    const blocked = join(codexRoot, "file");
    writeFileSync(blocked, "not a directory");
    makeSkill(root, "newbie", skillFrontmatter({ name: "newbie" }), "prior bytes");
    claudeCodeAdapter.userPath = () => root;
    let temporary = "";
    let locked = "";
    codexAdapter.userPath = () => {
      const rollback = readdirSync(root).find((name) => name.startsWith(".crew-rollback-"));
      if (rollback && !locked) {
        temporary = join(root, rollback);
        locked = join(temporary, "locked");
        mkdirSync(locked);
        writeFileSync(join(locked, "asset"), "cannot remove");
        chmodSync(locked, 0o555);
      }
      return fail ? blocked : codexRoot;
    };
    const tap = {
      name: "fixture",
      kind: "path" as const,
      path: source,
      url: "",
      subpath: "",
      registered: true,
    };
    const config: Config = {
      taps: [tap],
      disabled_agents: [],
      forced_agents: [],
      autoupdate: { enabled: false, interval_seconds: 14400 },
    };
    const entry: StateEntry = {
      name: "alpha",
      source: { tap: "fixture", path: "alpha" },
      ref: null,
      resolved_sha: null,
      content_hash: "sha256:unused",
      scope: "user",
      installed_at: "2026-01-01T00:00:00Z",
      agents: ["claude-code", "codex"],
      pinned: false,
      explicit: true,
      tracks_tap: true,
      required_by: [],
    };
    try {
      const result = reexpandTaps(
        { schema_version: 1, installations: [entry] },
        config,
        home,
        null,
        (args) => installNewTapChild(args, true, home, source),
      );
      const row = result.rows.find((r) => r.name === "newbie")!;
      const diagnostic = `could not remove rollback directory \`${temporary}\``;
      expect(result.hardFailure).toBe(fail);
      expect(row.kind).toBe(fail ? "tap_error" : "added");
      if (fail) {
        expect(row.error?.code).toBe("usage_error");
        expect(row.error?.message).toContain("codex");
        expect(row.error?.message).toContain(diagnostic);
        expect(result.added).toEqual([]);
      } else {
        expect(row.warnings).toEqual([diagnostic]);
        expect(result.added.map((e) => e.name)).toEqual(["newbie"]);
      }
      expect(readFileSync(join(root, "newbie", "SKILL.md"), "utf8")).toContain(
        fail ? "prior bytes" : "new bytes",
      );
    } finally {
      if (locked) chmodSync(locked, 0o755);
    }
  });
}
