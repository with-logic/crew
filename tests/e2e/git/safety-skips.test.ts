/** Update safety checks remain soft per-target outcomes (§10.1, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
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

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let targetRoot: string;

beforeEach(() => {
  targetRoot = makeTempDir("crew-update-safety-");
  claudeCodeAdapter.userPath = () => targetRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const sourceKind of ["git", "path"] as const) {
  for (const reason of ["customized", "untracked_directory", "inconsistent_marker"] as const) {
    test(`C-UPD-12 C-UPD-45 ${sourceKind} ${reason} stays soft and retryable`, () => {
      const home = makeCrewHome();
      const repo = makeTempDir();
      const source = makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }));
      makeGitRepo(repo);
      const ref = sourceKind === "git" ? `file://${repo}//demo` : source;
      expect(
        runCli(["install", ref, "--agent", "claude-code"], {
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
      const before = readState(home);
      const oldMarker = existsSync(markerPath) ? readFileSync(markerPath) : null;
      const oldSkill = readFileSync(join(dest, "SKILL.md"), "utf8");
      writeFileSync(join(source, "NEW.md"), "new upstream bytes");
      const newSha = sourceKind === "git" ? commitAll(repo, "v2") : null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const capture = captureStreams();
        expect(runCli(["update", "demo", "--json"], { home, streams: capture.streams })).toBe(0);
        const outcome = JSON.parse(capture.stdout()).rows[0].outcome;
        expect(outcome.kind).toBe("updated");
        expect(outcome.per_target).toEqual([{ agent: "claude-code", kind: "skipped", reason }]);
        expect(readState(home)).toEqual(before);
        expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe(oldSkill);
        expect(existsSync(join(dest, "NEW.md"))).toBe(false);
        expect(existsSync(markerPath) ? readFileSync(markerPath) : null).toEqual(oldMarker);
      }
      const retry = captureStreams();
      expect(
        runCli(["update", "demo", "--force", "--json"], { home, streams: retry.streams }),
      ).toBe(0);
      expect(JSON.parse(retry.stdout()).rows[0].outcome.per_target).toEqual([
        { agent: "claude-code", kind: "installed" },
      ]);
      expect(readState(home).installations[0]!.resolved_sha).toBe(newSha);
      expect(readState(home).installations[0]!.content_hash).not.toBe(
        before.installations[0]!.content_hash,
      );
      expect(readFileSync(join(dest, "NEW.md"), "utf8")).toBe("new upstream bytes");
    });
  }
}
