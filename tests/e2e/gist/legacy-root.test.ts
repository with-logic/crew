/** Existing root SKILL.md gist installations remain updateable (§9, §10.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { commitAll, makeTempDir } from "../../helpers/fixtures.ts";
import { GIST_URL, gistFixture } from "./helpers.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target: string;
beforeEach(() => {
  target = makeTempDir();
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, original);
  resetGitRunner();
});

for (const suffix of ["", "@main"]) {
  test(`C-GIST-04 a former individually installed root updates with ${suffix || "no ref"}`, () => {
    const f = gistFixture({ "SKILL.md": "legacy" });
    expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
    expect(f.cli("install", `snippets/legacy${suffix}`, "--agent", "claude-code").code).toBe(0);
    const state = readState(f.home);
    const entry = state.installations[0]!;
    expect(entry.tracks_tap).not.toBe(true);
    writeState(
      { ...state, installations: [{ ...entry, source: { ...entry.source, path: "" } }] },
      f.home,
    );
    const markerPath = join(target, "legacy", ".crew.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    writeFileSync(markerPath, JSON.stringify({ ...marker, path: "" }));
    const next = `${readFileSync(join(f.repo, "SKILL.md"), "utf8")}new bytes\n`;
    writeFileSync(join(f.repo, "SKILL.md"), next);
    commitAll(f.repo, "advance former root skill");
    const update = f.cli("update", "legacy", "--json");
    expect(update).toMatchObject({ code: 0 });
    expect(JSON.parse(update.out).rows[0].outcome.kind).toBe("updated");
    expect(readFileSync(join(target, "legacy", "SKILL.md"), "utf8")).toBe(next);
    expect(readState(f.home).installations[0]!.source.path).toBe("SKILL.md");
    expect(JSON.parse(readFileSync(markerPath, "utf8")).path).toBe("SKILL.md");
    expect(JSON.parse(f.cli("update", "legacy", "--json").out).rows[0].outcome.kind).toBe(
      "up_to_date",
    );
  });
}
