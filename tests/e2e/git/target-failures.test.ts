/** Per-target update failures retain the retry baseline (§10.1, §11.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
let claudeRoot: string;
let codexRoot: string;

beforeEach(() => {
  claudeRoot = makeTempDir("crew-update-claude-");
  codexRoot = join(makeTempDir("crew-update-codex-"), "codex-\u009b");
  mkdirSync(codexRoot);
  claudeCodeAdapter.userPath = () => claudeRoot;
  claudeCodeAdapter.detect = () => true;
  codexAdapter.userPath = () => codexRoot;
  codexAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, originals.claude);
  Object.assign(codexAdapter, originals.codex);
});

for (const sourceKind of ["git", "path"] as const) {
  for (const failedAgents of [["codex"], ["claude-code", "codex"]] as const) {
    test(`C-UPD-10 C-UPD-39 C-UPD-42 ${sourceKind} failed targets (${failedAgents.join(", ")}) stay retryable`, () => {
      const home = makeCrewHome();
      const repo = makeTempDir("crew-update-source-");
      const source = makeSkill(repo, "demo", skillFrontmatter({ name: "demo" }), "old bytes");
      makeGitRepo(repo);
      const ref = sourceKind === "git" ? `file://${repo}//demo` : source;
      const args = ["--agent", "claude-code", "--agent", "codex"];
      expect(
        runCli(["install", ref, ...args], {
          home,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
      const before = readState(home);
      const destinations = { "claude-code": claudeRoot, codex: codexRoot };
      const oldSkill = readFileSync(join(codexRoot, "demo", "SKILL.md"), "utf8");
      const oldMarker = readFileSync(join(codexRoot, "demo", ".crew.json"), "utf8");
      writeFileSync(join(source, "NEW.md"), "upstream bytes");
      const newSha = sourceKind === "git" ? commitAll(repo, "change demo") : null;
      const blockedRoots = failedAgents.map((agent) => destinations[agent]);
      for (const root of blockedRoots) chmodSync(root, 0o555);
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const capture = captureStreams();
          expect(runCli(["update", "demo", "--json"], { home, streams: capture.streams })).toBe(1);
          const outcome = JSON.parse(capture.stdout()).rows[0].outcome;
          expect(capture.stdout()).not.toContain("\u009b");
          expect(
            outcome.per_target.find((target: { agent: string }) => target.agent === "codex").error
              .message,
          ).toContain("\\x9b");
          expect(outcome.kind).toBe("updated");
          for (const agent of failedAgents) {
            expect(outcome.per_target).toContainEqual({
              agent,
              kind: "failed",
              error: { code: "EACCES", message: expect.any(String) },
            });
          }
          if (failedAgents.length === 1) {
            expect(outcome.per_target).toContainEqual({
              agent: "claude-code",
              kind: attempt === 0 ? "installed" : "up_to_date",
            });
            expect(readFileSync(join(claudeRoot, "demo", "NEW.md"), "utf8")).toBe("upstream bytes");
          }
          expect(readState(home)).toEqual(before);
          expect(readFileSync(join(codexRoot, "demo", "SKILL.md"), "utf8")).toBe(oldSkill);
          expect(readFileSync(join(codexRoot, "demo", ".crew.json"), "utf8")).toBe(oldMarker);
        }
        const human = captureStreams();
        expect(runCli(["update", "demo"], { home, streams: human.streams })).toBe(1);
        const output = human.stdout();
        for (const agent of failedAgents) expect(output).toContain(`${agent}: failed (EACCES)`);
        expect(output).not.toContain("\u009b");
        expect(output).toContain("\\x9b");
        expect(output.trim().split("\n").at(-1)).toBe(
          failedAgents.length === 1 ? "1 partially updated · 1 failure" : "1 failure",
        );
        expect(output).toContain(failedAgents.length === 1 ? "partially updated" : "[fail] demo");
        expect(readState(home)).toEqual(before);
        expect(human.stderr()).toBe("");
        const quiet = captureStreams();
        expect(runCli(["update", "demo", "--quiet"], { home, streams: quiet.streams })).toBe(1);
        expect(quiet.stdout()).toBe("");
        for (const agent of failedAgents)
          expect(quiet.stderr()).toContain(`demo: ${agent}: failed (EACCES):`);
        expect(quiet.stderr()).toContain("\\x9b");
        expect(quiet.stderr()).not.toContain("\u009b");
        expect(readState(home)).toEqual(before);
        expect(readFileSync(join(codexRoot, "demo", "SKILL.md"), "utf8")).toBe(oldSkill);
        expect(readFileSync(join(codexRoot, "demo", ".crew.json"), "utf8")).toBe(oldMarker);
      } finally {
        for (const root of blockedRoots) chmodSync(root, 0o755);
      }
      const capture = captureStreams();
      expect(runCli(["update", "demo", "--json"], { home, streams: capture.streams })).toBe(0);
      expect(JSON.parse(capture.stdout()).rows[0].outcome.per_target).toContainEqual({
        agent: "codex",
        kind: "installed",
      });
      const after = readState(home).installations[0]!;
      expect(after.resolved_sha).toBe(newSha);
      expect(after.content_hash).not.toBe(before.installations[0]!.content_hash);
      expect(after.agents).toEqual(before.installations[0]!.agents);
      expect(readFileSync(join(codexRoot, "demo", "NEW.md"), "utf8")).toBe("upstream bytes");
      const final = captureStreams();
      expect(runCli(["update", "demo", "--json"], { home, streams: final.streams })).toBe(0);
      expect(JSON.parse(final.stdout()).rows[0].outcome.kind).toBe("up_to_date");
    });
  }
}
