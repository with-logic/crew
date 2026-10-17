/**
 * Doctor's check 3 against an install folder crew can't read all of
 * (§11.2 checks 3 and 9; C-STATE-05a): `--verify` reports it as an
 * `unreadable_marker` finding naming the folder it couldn't read, and the run's other
 * checks still report — another copy's local edits included.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { BOTH, buildRepo, codes, doctor, must, redirectAgents } from "./helpers.ts";

let agents: ReturnType<typeof redirectAgents>;
beforeEach(() => {
  agents = redirectAgents();
});
afterEach(() => agents.restore());

test("C-STATE-05a --verify reports a copy it can't read all of, and still checks the rest", () => {
  const home = makeCrewHome();
  const repo = buildRepo(["a", "b"]);
  must(home, ["install", `file://${repo}`, ...BOTH]);
  const root = codexAdapter.userPath();
  writeFileSync(join(root, "b", "SKILL.md"), "edited\n");
  const sealed = join(root, "a", "sealed");
  mkdirSync(sealed);
  chmodSync(sealed, 0o000);
  try {
    const verified = doctor(home, ["--verify"]);
    expect(verified.code).toBe(1);
    expect(codes(verified.findings)).toEqual(["customized:warn", "unreadable_marker:error"]);
    const unreadable = verified.findings.find((f) => f.code === "unreadable_marker")!;
    // Named by the folder at fault, not just the copy it sits in.
    expect(unreadable.message).toContain(`crew can't read \`${sealed}\` (EACCES`);
    expect(unreadable.message).toContain(`check \`${join(root, "a")}\` for local edits`);
  } finally {
    chmodSync(sealed, 0o755);
  }
});
