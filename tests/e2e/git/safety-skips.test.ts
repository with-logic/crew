/** Update safety checks remain soft per-target outcomes (§10.1, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let targetRoot: string;

beforeEach(() => {
  targetRoot = makeTempDir("crew-update-safety-");
  claudeCodeAdapter.userPath = () => targetRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const reason of ["customized", "untracked_directory", "inconsistent_marker"] as const) {
  test(`C-UPD-12 ${reason} stays a soft update skip`, () => {
    const home = makeCrewHome();
    const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    expect(
      runCli(["install", source, "--agent", "claude-code"], {
        home,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    const dest = join(targetRoot, "demo");
    const markerPath = join(dest, ".crew.json");
    if (reason === "customized") writeFileSync(join(dest, "MINE.md"), "local notes");
    if (reason === "untracked_directory") rmSync(markerPath);
    if (reason === "inconsistent_marker") {
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      writeFileSync(markerPath, JSON.stringify({ ...marker, name: "another-skill" }));
    }
    const oldSkill = readFileSync(join(dest, "SKILL.md"), "utf8");
    writeFileSync(join(source, "NEW.md"), "new upstream bytes");
    const capture = captureStreams();
    expect(runCli(["update", "demo", "--json"], { home, streams: capture.streams })).toBe(0);
    const outcome = JSON.parse(capture.stdout()).rows[0].outcome;
    expect(outcome.kind).toBe("updated");
    expect(outcome.per_target).toEqual([{ agent: "claude-code", kind: "skipped", reason }]);
    expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe(oldSkill);
  });
}
