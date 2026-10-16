/**
 * `crew update` of a skill holding a file crew can't read (§10.1, §13;
 * C-UPD-40): a local fault, so the update fails with `source_unreachable`
 * — not an upstream deletion, and not a usage error.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

function run(home: string, args: string[]): { code: number; stdout: string } {
  const cap = captureStreams();
  const code = runCli(args, { home, streams: cap.streams });
  return { code, stdout: cap.stdout() };
}

test("C-UPD-40 a file crew can't read while staging fails the update as source_unreachable", () => {
  const home = makeCrewHome();
  const tapDir = makeTempDir();
  const skill = makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Original.\n");
  expect(run(home, ["tap", "add", tapDir, "mine"]).code).toBe(0);
  expect(run(home, ["install", "mine/demo"]).code).toBe(0);
  makeSkill(tapDir, "demo", skillFrontmatter({ name: "demo" }), "Edited.\n");
  writeFileSync(join(skill, "notes.txt"), "private\n");
  chmodSync(join(skill, "notes.txt"), 0o000);
  try {
    const r = run(home, ["update", "--json"]);
    expect(r.code).toBe(1);
    const [row] = JSON.parse(r.stdout).rows;
    expect([row.name, row.outcome.kind, row.outcome.error.code]).toEqual([
      "demo",
      "failed",
      "source_unreachable",
    ]);
  } finally {
    chmodSync(join(skill, "notes.txt"), 0o644);
  }
});
