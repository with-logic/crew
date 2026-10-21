/** Update keeps cleanup faults hard while upstream deletion stays soft (§10.1, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner, setGitRunner } from "../../../src/git/exec.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/types.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

let agentRoot = "";
let original: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  agentRoot = makeTempDir("crew-update-cleanup-agent-");
  original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
  resetGitRunner();
});

for (const tracked of [false, true]) {
  for (const cleanupFault of [false, true]) {
    test(`C-UPD-16c deletion with cleanupFault=${cleanupFault}, tracked=${tracked}`, () => {
      const home = makeCrewHome();
      const repo = makeTempDir("crew-update-cleanup-repo-");
      makeSkill(join(repo, "skills"), "demo", skillFrontmatter({ name: "demo" }));
      makeGitRepo(repo);
      expect(
        runCli(["tap", "add", `file://${repo}//skills`, "local"], {
          home,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
      expect(
        runCli(["install", "--agent", "claude-code", tracked ? "local@main" : "local/demo@main"], {
          home,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
      const state = readFileSync(join(home, "state.json"), "utf8");
      const installed = readFileSync(join(agentRoot, "demo", "SKILL.md"), "utf8");
      const marker = readFileSync(join(agentRoot, "demo", ".crew.json"), "utf8");
      rmSync(join(repo, "skills"), { recursive: true });
      commitAll(repo, "delete upstream skills");

      let retained = "";
      if (cleanupFault) {
        const previous = setGitRunner((args, options) => {
          const result = previous(args, options);
          const worktree = args.find((arg) => arg.startsWith("--work-tree="));
          // Fail only the first export's cleanup; subsequent per-entry reads stay independent.
          if (retained === "" && worktree !== undefined) {
            expect(result.exitCode).not.toBe(0);
            expect(result.stderr).toContain("did not match any file");
            retained = worktree.slice("--work-tree=".length);
            writeFileSync(join(retained, "partial-export"), "retained export bytes");
            chmodSync(retained, 0o500);
          }
          return result;
        });
      }
      const output = captureStreams();
      let exit: number;
      try {
        exit = runCli(["update", "demo", "--json"], { home, streams: output.streams });
      } finally {
        if (retained !== "") chmodSync(retained, 0o700);
      }
      const payload = JSON.parse(output.stdout()) as {
        rows: readonly UpdateRow[];
        tap_reexpand_rows: readonly TapReexpandRow[];
      };
      expect(exit).toBe(cleanupFault ? 1 : 0);
      if (cleanupFault) {
        const error = tracked
          ? payload.tap_reexpand_rows[0]!.error!
          : (payload.rows[0]!.outcome as Extract<UpdateRow["outcome"], { kind: "failed" }>).error;
        expect(error.code).toBe("no_skills_found");
        expect(error.message).toContain(retained);
        expect(error.message).toMatch(/EACCES|EPERM/);
        expect(existsSync(retained)).toBe(true);
      }
      if (tracked || !cleanupFault) expect(payload.rows[0]!.outcome.kind).toBe("source_gone");
      else expect(payload.rows[0]!.outcome.kind).toBe("failed");
      expect(readFileSync(join(home, "state.json"), "utf8")).toBe(state);
      expect(readFileSync(join(agentRoot, "demo", "SKILL.md"), "utf8")).toBe(installed);
      expect(readFileSync(join(agentRoot, "demo", ".crew.json"), "utf8")).toBe(marker);
    });
  }
}
