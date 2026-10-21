/** New-child ownership is checked on every target before copying (§5.4, §10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

let cc: string;
let codex: string;
let originals: {
  cc: () => string;
  codex: () => string;
  ccDetect: () => boolean;
  codexDetect: () => boolean;
};
beforeEach(() => {
  cc = makeTempDir();
  codex = makeTempDir();
  originals = {
    cc: claudeCodeAdapter.userPath,
    codex: codexAdapter.userPath,
    ccDetect: claudeCodeAdapter.detect,
    codexDetect: codexAdapter.detect,
  };
  claudeCodeAdapter.userPath = () => cc;
  codexAdapter.userPath = () => codex;
  claudeCodeAdapter.detect = () => true;
  codexAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originals.cc;
  codexAdapter.userPath = originals.codex;
  claudeCodeAdapter.detect = originals.ccDetect;
  codexAdapter.detect = originals.codexDetect;
});

for (const preview of [false, true]) {
  test(`C-INST-14 a foreign marker on the later target prevents all child copies (${preview})`, () => {
    const home = makeCrewHome();
    const invoke = (args: string[]) => {
      const cap = captureStreams();
      const code = runCli(args, { home, streams: cap.streams });
      return { code, output: cap.stdout() };
    };
    const incoming = makeTempDir();
    makeSkill(incoming, "alpha", skillFrontmatter({ name: "alpha" }));
    makeGitRepo(incoming);
    expect(invoke(["tap", "add", `file://${incoming}`, "incoming"]).code).toBe(0);
    expect(invoke(["install", "incoming", "--agent", "claude-code", "--agent", "codex"]).code).toBe(
      0,
    );
    const foreign = makeTempDir();
    makeSkill(foreign, "shared", skillFrontmatter({ name: "shared" }), "owned by another source");
    makeGitRepo(foreign);
    expect(invoke(["install", `file://${foreign}`, "--agent", "codex"]).code).toBe(0);
    const state = readState(home);
    writeState(
      { ...state, installations: state.installations.filter((e) => e.name !== "shared") },
      home,
    );
    const marker = readFileSync(join(codex, "shared", ".crew.json"), "utf8");
    const bytes = readFileSync(join(codex, "shared", "SKILL.md"), "utf8");
    makeSkill(incoming, "shared", skillFrontmatter({ name: "shared" }), "incoming bytes");
    makeSkill(incoming, "healthy", skillFrontmatter({ name: "healthy" }));
    commitAll(incoming, "new children");
    const result = invoke([
      "update",
      "incoming",
      "--force",
      "--json",
      ...(preview ? ["--dry-run"] : []),
    ]);
    expect(result.code).toBe(1);
    expect(JSON.parse(result.output).tap_reexpand_rows).toContainEqual(
      expect.objectContaining({
        name: "shared",
        kind: "tap_error",
        error: expect.objectContaining({ code: "name_conflict" }),
      }),
    );
    expect(existsSync(join(cc, "shared"))).toBe(false);
    expect(readFileSync(join(codex, "shared", ".crew.json"), "utf8")).toBe(marker);
    expect(readFileSync(join(codex, "shared", "SKILL.md"), "utf8")).toBe(bytes);
    expect(readState(home).installations.some((e) => e.name === "shared")).toBe(false);
    for (const base of [cc, codex]) expect(existsSync(join(base, "healthy"))).toBe(!preview);
  });
}
