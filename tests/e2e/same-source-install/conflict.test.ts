/**
 * C-INST-13a: same canonical location is a duplicate, not a conflict.
 *
 * One repository can back several taps: installing `<url>//skills/docx`
 * records a tap with that subpath, while installing `<url>` records a
 * tap with none. Both reach the same directory, so the second install is
 * already-installed rather than `name_conflict` (§5.4).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { type AdapterRedirect, buildRepo, install, redirectClaudeCode } from "./helpers.ts";

let cc: AdapterRedirect;

beforeEach(() => {
  cc = redirectClaudeCode();
});
afterEach(() => {
  cc.restore();
});

describe("C-INST-13a same repo at the same path is not a name conflict", () => {
  test("C-INST-13a subpath install then whole-repo install reports already installed", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);

    expect(install(home, `file://${repo}//skills/docx`).code).toBe(0);
    const second = install(home, `file://${repo}`);

    expect(second.code).toBe(0);
    expect(second.out).toContain("already installed");
    expect(second.out).not.toContain("name_conflict");
    // The sibling that really was new still installs.
    const names = readState(home)
      .installations.map((e) => e.name)
      .sort();
    expect(names).toEqual(["docx", "pdf"]);
  });

  test("C-INST-13a a different repo with the same skill name still conflicts", () => {
    const home = makeCrewHome();
    const repoA = buildRepo(["docx"]);
    const repoB = buildRepo(["docx"]);

    expect(install(home, `file://${repoA}//skills/docx`).code).toBe(0);
    const cap = captureStreams();
    const code = runCli(["install", `file://${repoB}//skills/docx`, "--agent", "claude-code"], {
      home,
      streams: cap.streams,
    });

    expect(code).toBe(4);
    expect(cap.stderr()).toContain("name_conflict");
  });
});
