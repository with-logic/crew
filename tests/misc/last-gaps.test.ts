/**
 * Close remaining small coverage gaps.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { CrewError } from "../../src/core/errors.ts";
import { parseRef } from "../../src/refs/parse.ts";
import { writeState } from "../../src/state/load.ts";
import { claudeCodeAdapter } from "../../src/targets/claude-code.ts";
import { codexAdapter } from "../../src/targets/codex.ts";
import { geminiCliAdapter } from "../../src/targets/gemini-cli.ts";
import { isOnPath } from "../../src/targets/path.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let restore: (() => void) | null = null;
let ccRoot: string;

function setupTargets() {
  ccRoot = makeTempDir("crew-cc-");
  const co = makeTempDir("crew-co-");
  const ge = makeTempDir("crew-ge-");
  const originals = {
    cc: { u: claudeCodeAdapter.userPath, d: claudeCodeAdapter.detect },
    co: { u: codexAdapter.userPath, d: codexAdapter.detect },
    ge: { u: geminiCliAdapter.userPath, d: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => co;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => ge;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.u;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.d;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.u;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.d;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.u;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.d;
  };
}
beforeEach(() => setupTargets());
afterEach(() => {
  if (restore) {
    restore();
  }
  restore = null;
});

describe("doctor warns when target in state no longer detected", () => {
  test("undetected target with state entry", () => {
    const home = makeCrewHome();
    // Pretend codex became undetected.
    (codexAdapter as { detect: () => boolean }).detect = () => false;

    writeState(
      {
        schema_version: 1,
        installations: [
          {
            name: "ghost",
            source: { tap: "core", path: "ghost" },
            ref: null,
            resolved_sha: null,
            content_hash: "sha256:00",
            scope: "user",
            installed_at: "2026-04-18T00:00:00Z",
            targets: ["codex"],
            pinned: false,
            explicit: true,
            required_by: [],
          },
        ],
      },
      home,
    );
    const c = captureStreams();
    runCli(["doctor"], { home, streams: c.streams });
    expect(c.stdout()).toContain("target_missing");
  });
});

describe("doctor repair merges markers into existing entry", () => {
  test("adds missing target to an existing state entry", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    // Truncate state targets to only include claude-code.
    const state = require("../../src/state/load.ts").readState(home);
    writeState(
      {
        ...state,
        installations: state.installations.map((e: { name: string }) => ({
          ...e,
          targets: ["claude-code"],
        })),
      },
      home,
    );
    const code = runCli(["doctor", "--repair"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    const after = require("../../src/state/load.ts").readState(home);
    expect(after.installations[0].targets.length).toBeGreaterThan(1);
  });
});

describe("uninstall per-target failure", () => {
  test("uninstall surfaces per-target errors", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    runCli(["install", skill], { home, streams: captureStreams().streams });
    // Tamper with the marker so uninstall throws `inconsistent_marker`.
    writeFileSync(
      join(ccRoot, "demo", ".crew.json"),
      JSON.stringify({
        schema_version: 1,
        name: "different",
        source: { type: "path", path: "/x" },
        ref: null,
        resolved_sha: null,
        content_hash: "sha256:0",
        scope: "user",
        installed_at: "2026-04-18T00:00:00Z",
        installed_by: "crew/test",
      }),
    );
    const c = captureStreams();
    const code = runCli(["uninstall", "demo"], { home, streams: c.streams });
    expect(code).toBe(1);
    expect(c.stdout()).toContain("FAILED");
  });
});

describe("isOnPath error handling", () => {
  test("stat errors fall through", () => {
    const prev = process.env["PATH"];
    try {
      // Include a non-existent dir explicitly to hit the empty-name branch.
      process.env["PATH"] = `/nonexistent-dir-${Date.now()}:${prev ?? ""}`;
      // A no-such-binary lookup exercises existsSync=false path.
      expect(isOnPath(`this-doesnt-exist-${Date.now()}`)).toBe(false);
    } finally {
      process.env["PATH"] = prev;
    }
  });

  test("PATH missing (undefined) → false", () => {
    const prev = process.env["PATH"];
    try {
      delete process.env["PATH"];
      expect(isOnPath("bun")).toBe(false);
    } finally {
      process.env["PATH"] = prev;
    }
  });
});

describe("parseRef: tap with valid identifier reaching path form validator", () => {
  test("ambiguous @ in git URL does not swallow ref", () => {
    const r = parseRef("https://github.com/owner/repo.git@v1.0");
    expect(r.type).toBe("git");
    if (r.type === "git") {
      expect(r.ref).toBe("v1.0");
    }
  });

  test("three-segment path (too many) fails", () => {
    expect(() => parseRef("a/b/c")).toThrow(CrewError);
  });

  test("invalid git url missing owner/repo", () => {
    expect(() => parseRef("https://example.com/onlyone")).toThrow(CrewError);
  });

  test("invalid shorthand host rejected", () => {
    expect(() => parseRef("xy:owner/repo")).toThrow(CrewError);
  });
});

describe("yaml parse edges", () => {
  test("parse empty string list item -> null", () => {
    const { parseYaml } = require("../../src/yaml/parse.ts");
    const r = parseYaml("- \n");
    // Dash followed by whitespace equates to a null entry.
    expect(Array.isArray(r) ? r[0] : null).toBe(null);
  });
});

// Silence unused imports.
void mkdirSync;
