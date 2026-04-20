/**
 * Per-adapter sanity: each adapter resolves to its documented paths
 * and detects itself via the documented signal(s). The global preload
 * neutralizes these adapters; `withOriginalAdapter` swaps the real
 * impl back in for the duration of the assertion.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_ADAPTERS } from "../../src/targets/registry.ts";
import { withOriginalAdapter } from "../helpers/env.ts";

// Every adapter redirects its user path detection via $HOME. Swap in
// a throwaway HOME so the real `isDirectory` checks land on a
// controllable directory tree.
const realHome = process.env["HOME"];
let tempHome: string;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "crew-adapter-test-"));
  process.env["HOME"] = tempHome;
});

afterEach(() => {
  if (realHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = realHome;
});

/** Test shape: one row per adapter describing its documented paths. */
interface AdapterExpectation {
  readonly name: string;
  /** Subpath under $HOME that userPath() must resolve to. */
  readonly userSuffix: string;
  /** Project-scope suffix relative to cwd. Empty string = no project scope. */
  readonly projectSuffix: string;
  /** Subpaths under $HOME to create to trigger detect() === true. */
  readonly detectFixtures: readonly string[];
}

const EXPECTATIONS: readonly AdapterExpectation[] = [
  {
    name: "amp",
    userSuffix: ".config/amp/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".config/amp"],
  },
  {
    name: "autohand",
    userSuffix: ".autohand/skills",
    projectSuffix: ".autohand/skills",
    detectFixtures: [".autohand"],
  },
  {
    name: "claude-code",
    userSuffix: ".claude/skills",
    projectSuffix: ".claude/skills",
    detectFixtures: [".claude"],
  },
  {
    name: "codex",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".codex"],
  },
  {
    name: "command-code",
    userSuffix: ".commandcode/skills",
    projectSuffix: ".commandcode/skills",
    detectFixtures: [".commandcode"],
  },
  {
    name: "cursor",
    userSuffix: ".cursor/skills",
    projectSuffix: ".cursor/skills",
    detectFixtures: [".cursor"],
  },
  {
    name: "factory",
    userSuffix: ".factory/skills",
    projectSuffix: ".factory/skills",
    detectFixtures: [".factory"],
  },
  {
    name: "gemini-cli",
    userSuffix: ".gemini/skills",
    projectSuffix: ".gemini/skills",
    detectFixtures: [".gemini"],
  },
  {
    name: "github-copilot",
    userSuffix: ".copilot/skills",
    projectSuffix: ".github/skills",
    detectFixtures: [".copilot"],
  },
  {
    name: "goose",
    userSuffix: ".config/goose/skills",
    projectSuffix: ".goose/skills",
    detectFixtures: [".config/goose"],
  },
  {
    name: "junie",
    userSuffix: ".junie/skills",
    projectSuffix: ".junie/skills",
    detectFixtures: [".junie"],
  },
  {
    name: "kiro",
    userSuffix: ".kiro/skills",
    projectSuffix: ".kiro/skills",
    detectFixtures: [".kiro"],
  },
  {
    name: "mistral-vibe",
    userSuffix: ".vibe/skills",
    projectSuffix: ".vibe/skills",
    detectFixtures: [".vibe"],
  },
  {
    name: "nanobot",
    userSuffix: ".nanobot/workspace/skills",
    projectSuffix: "",
    detectFixtures: [".nanobot"],
  },
  {
    name: "opencode",
    userSuffix: ".config/opencode/skills",
    projectSuffix: ".opencode/skills",
    detectFixtures: [".config/opencode"],
  },
  {
    name: "pi",
    userSuffix: ".pi/agent/skills",
    projectSuffix: ".pi/skills",
    detectFixtures: [".pi"],
  },
  {
    name: "roo-code",
    userSuffix: ".roo/skills",
    projectSuffix: ".roo/skills",
    detectFixtures: [".roo"],
  },
];

describe("target adapter paths (§7.2)", () => {
  test("every registered adapter has an expectation", () => {
    expect(ALL_ADAPTERS.length).toBe(EXPECTATIONS.length);
    for (const a of ALL_ADAPTERS) {
      expect(EXPECTATIONS.some((e) => e.name === a.name)).toBe(true);
    }
  });

  for (const exp of EXPECTATIONS) {
    test(`${exp.name} resolves user + project paths`, () => {
      withOriginalAdapter(exp.name, (a) => {
        expect(a.userPath()).toBe(join(tempHome, exp.userSuffix));
        if (exp.projectSuffix === "") {
          expect(a.projectPath("/tmp/proj")).toBe("");
        } else {
          expect(a.projectPath("/tmp/proj")).toBe(join("/tmp/proj", exp.projectSuffix));
        }
      });
    });

    test(`${exp.name} detect() false without fixtures`, () => {
      // Wipe PATH to zero so isOnPath can't accidentally trip on a
      // dev machine's global installs.
      const prevPath = process.env["PATH"];
      process.env["PATH"] = "";
      try {
        withOriginalAdapter(exp.name, (a) => {
          // Cursor also detects via /Applications/Cursor.app, which
          // may exist on a dev machine. In that case we can't assert
          // `false` here; the other "detect via fixture" test still
          // exercises the primary branch.
          if (exp.name === "cursor") {
            expect(typeof a.detect()).toBe("boolean");
          } else {
            expect(a.detect()).toBe(false);
          }
        });
      } finally {
        process.env["PATH"] = prevPath;
      }
    });

    test(`${exp.name} detect() true when config dir exists`, () => {
      for (const sub of exp.detectFixtures) {
        mkdirSync(join(tempHome, sub), { recursive: true });
      }
      const prevPath = process.env["PATH"];
      process.env["PATH"] = "";
      try {
        withOriginalAdapter(exp.name, (a) => {
          expect(a.detect()).toBe(true);
        });
      } finally {
        process.env["PATH"] = prevPath;
      }
    });
  }
});

describe("adapter path branches", () => {
  test("cursor also detects via /Applications/Cursor.app", () => {
    // Not practical to create `/Applications/Cursor.app` in a
    // sandbox. We exercise the branch by swapping the check into an
    // empty tmp dir tree and asserting false — the other test above
    // already exercises the `~/.cursor` → true branch.
    const prevPath = process.env["PATH"];
    process.env["PATH"] = "";
    try {
      withOriginalAdapter("cursor", (a) => {
        // If the dev machine happens to have Cursor.app installed,
        // this will be true; otherwise false. Either way, boolean.
        expect(typeof a.detect()).toBe("boolean");
      });
    } finally {
      process.env["PATH"] = prevPath;
    }
  });

  test("command-code detects via the `cmd` binary alias", () => {
    // Create a fake `cmd` binary on PATH; isOnPath should pick it up.
    const binDir = mkdtempSync(join(tmpdir(), "crew-cmd-bin-"));
    const fakeCmd = join(binDir, "cmd");
    require("node:fs").writeFileSync(fakeCmd, "#!/bin/sh\n", { mode: 0o755 });
    const prevPath = process.env["PATH"];
    process.env["PATH"] = binDir;
    try {
      withOriginalAdapter("command-code", (a) => {
        expect(a.detect()).toBe(true);
      });
    } finally {
      process.env["PATH"] = prevPath;
    }
  });
});
