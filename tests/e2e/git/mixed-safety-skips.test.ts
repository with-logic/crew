/** Completed targets advance state alongside safety skips (§10.1, C-UPD-45). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

const originals = {
  claude: { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
  codex: { userPath: codexAdapter.userPath, detect: codexAdapter.detect },
};
let completedRoot: string;
let skippedRoot: string;

beforeEach(() => {
  completedRoot = makeTempDir("crew-update-completed-");
  skippedRoot = makeTempDir("crew-update-skipped-");
  claudeCodeAdapter.userPath = () => completedRoot;
  claudeCodeAdapter.detect = () => true;
  codexAdapter.userPath = () => skippedRoot;
  codexAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, originals.claude);
  Object.assign(codexAdapter, originals.codex);
});

for (const reason of ["customized", "untracked_directory", "inconsistent_marker"] as const) {
  test(`C-UPD-45 a completed target advances state alongside ${reason}`, () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-update-mixed-source-");
    const source = makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }), "old bytes");
    const firstSha = makeGitRepo(repo).sha;
    expect(
      runCli(["install", `file://${repo}//demo`, "--agent", "claude-code", "--agent", "codex"], {
        home,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    const before = readState(home).installations[0]!;
    expect(before.resolved_sha).toBe(firstSha);
    const skipped = join(skippedRoot, "demo");
    const markerPath = join(skipped, ".crew.json");
    if (reason === "customized") writeFileSync(join(skipped, "MINE.md"), "local notes");
    if (reason === "untracked_directory") rmSync(markerPath);
    if (reason === "inconsistent_marker") {
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      writeFileSync(markerPath, JSON.stringify({ ...marker, name: "another-skill" }));
    }
    const oldMarker = existsSync(markerPath) ? readFileSync(markerPath) : null;
    const oldSkill = readFileSync(join(skipped, "SKILL.md"));
    writeFileSync(join(source, "NEW.md"), "new upstream bytes");
    const newSha = commitAll(repo, "v2");
    expect(newSha).not.toBe(firstSha);

    const capture = captureStreams();
    expect(runCli(["update", "demo", "--json"], { home, streams: capture.streams })).toBe(0);
    const outcome = JSON.parse(capture.stdout()).rows[0].outcome;
    expect(outcome.kind).toBe("updated");
    expect(outcome.per_target).toEqual([
      { agent: "claude-code", kind: "installed" },
      { agent: "codex", kind: "skipped", reason },
    ]);
    const after = readState(home).installations[0]!;
    expect(after.resolved_sha).toBe(newSha);
    expect(after.content_hash).not.toBe(before.content_hash);
    expect(after.agents).toEqual(before.agents);
    const completed = join(completedRoot, "demo");
    const newMarker = JSON.parse(readFileSync(join(completed, ".crew.json"), "utf8"));
    expect(newMarker.resolved_sha).toBe(newSha);
    expect(newMarker.content_hash).toBe(after.content_hash);
    expect(readFileSync(join(completed, "NEW.md"), "utf8")).toBe("new upstream bytes");
    expect(readFileSync(join(skipped, "SKILL.md"))).toEqual(oldSkill);
    expect(existsSync(join(skipped, "NEW.md"))).toBe(false);
    expect(existsSync(markerPath) ? readFileSync(markerPath) : null).toEqual(oldMarker);
    if (reason === "customized")
      expect(readFileSync(join(skipped, "MINE.md"), "utf8")).toBe("local notes");
  });
}
