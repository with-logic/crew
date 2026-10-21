/** Successful child cleanup failures warn in CLI output and preserve additions (§10.1.1). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import type { TapReexpandRow } from "../../src/install/tap-reexpand/types.ts";
import { readState, writeState } from "../../src/state/load.ts";
import { redactText, sanitizeLine } from "../../src/util/redact.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const originalPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
afterEach(() => {
  claudeCodeAdapter.userPath = originalPath;
  claudeCodeAdapter.detect = originalDetect;
});

function invoke(home: string, args: string[]) {
  const cap = captureStreams();
  const code = runCli(args, { home, streams: cap.streams });
  return { code, stdout: cap.stdout() };
}

for (const json of [false, true]) {
  test(`C-UPD-38 successful cleanup warning reaches ${json ? "JSON" : "human"} output`, () => {
    const home = makeCrewHome();
    const root = join(makeTempDir(), "controls\n\r\x1b\x7f\x85");
    mkdirSync(root);
    claudeCodeAdapter.userPath = () => root;
    claudeCodeAdapter.detect = () => true;
    const source = makeTempDir();
    makeSkill(source, "alpha", skillFrontmatter({ name: "alpha" }));
    expect(invoke(home, ["tap", "add", source, "fixture"]).code).toBe(0);
    expect(invoke(home, ["install", "fixture", "--agent", "claude-code"]).code).toBe(0);
    makeSkill(source, "newbie", skillFrontmatter({ name: "newbie" }), "prior bytes");
    expect(invoke(home, ["install", "fixture/newbie", "--agent", "claude-code"]).code).toBe(0);
    const state = readState(home);
    writeState(
      { ...state, installations: state.installations.filter((e) => e.name !== "newbie") },
      home,
    );
    makeSkill(source, "newbie", skillFrontmatter({ name: "newbie" }), "new bytes");
    makeSkill(source, "other", skillFrontmatter({ name: "other" }));
    const prior = join(root, "newbie");
    const locked = join(prior, "locked");
    mkdirSync(locked);
    writeFileSync(join(locked, "asset"), "old asset");
    chmodSync(locked, 0o555);
    try {
      const result = invoke(home, ["update", "fixture", "--force", ...(json ? ["--json"] : [])]);
      expect(result.code).toBe(0);
      const temporary = join(
        root,
        readdirSync(root).find((name) => name.startsWith(".crew-rollback-"))!,
      );
      const diagnostic = sanitizeLine(
        redactText(`could not remove rollback directory \`${temporary}\``),
      );
      expect(diagnostic).toContain("controls\\x0a\\x0d\\x1b\\x7f\\x85");
      if (json) {
        const data = JSON.parse(result.stdout) as { tap_reexpand_rows: TapReexpandRow[] };
        expect(data.tap_reexpand_rows.find((r) => r.name === "newbie")).toEqual({
          name: "newbie",
          scope: "user",
          tap: "fixture",
          kind: "added",
          warnings: [diagnostic],
        });
        expect(data.tap_reexpand_rows.find((r) => r.name === "other")).toEqual({
          name: "other",
          scope: "user",
          tap: "fixture",
          kind: "added",
        });
      } else {
        expect(result.stdout).toContain(`[warn] newbie (from fixture): ${diagnostic}`);
        expect(result.stdout).toContain("2 new");
        expect(result.stdout).not.toContain("failure");
      }
      expect(
        readState(home)
          .installations.map((e) => e.name)
          .sort(),
      ).toEqual(["alpha", "newbie", "other"]);
      expect(readFileSync(join(root, "newbie", "SKILL.md"), "utf8")).toContain("new bytes");
      expect(readFileSync(join(temporary, "prior", "locked", "asset"), "utf8")).toBe("old asset");
    } finally {
      const temporary = readdirSync(root).find((name) => name.startsWith(".crew-rollback-"));
      chmodSync(temporary ? join(root, temporary, "prior", "locked") : locked, 0o755);
    }
  });
}
