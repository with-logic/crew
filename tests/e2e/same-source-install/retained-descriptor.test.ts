/**
 * Retained attribution survives real reinstalls in state and markers
 * (§5.4, §10.1.1, §11.1; C-INST-13c/13h).
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import type { Marker } from "../../../src/core/types.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeTempDir } from "../../helpers/fixtures.ts";
import { buildRepo } from "./helpers.ts";

const originalClaude = {
  userPath: claudeCodeAdapter.userPath,
  projectPath: claudeCodeAdapter.projectPath,
  detect: claudeCodeAdapter.detect,
};
const originalCodex = {
  userPath: codexAdapter.userPath,
  projectPath: codexAdapter.projectPath,
  detect: codexAdapter.detect,
};
let claudeRoot: string;
let codexRoot: string;
beforeEach(() => {
  claudeRoot = makeTempDir("crew-retained-claude-");
  codexRoot = makeTempDir("crew-retained-codex-");
  claudeCodeAdapter.userPath = () => claudeRoot;
  claudeCodeAdapter.projectPath = (cwd) => join(cwd, ".claude", "skills");
  claudeCodeAdapter.detect = () => true;
  codexAdapter.userPath = () => codexRoot;
  codexAdapter.projectPath = (cwd) => join(cwd, ".codex", "skills");
  codexAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, originalClaude);
  Object.assign(codexAdapter, originalCodex);
});

for (const scope of ["user", "project"] as const) {
  for (const registered of [false, true]) {
    for (const mode of ["force", "new-agent", "changed-sha"] as const) {
      test(`C-INST-13c/13h ${scope} retained marker (registered: ${registered}, ${mode})`, () => {
        const home = makeCrewHome();
        const cwd = makeTempDir("crew-retained-project-");
        const repo = buildRepo(["docx", "pdf"]);
        const run = (args: string[]) =>
          runCli(args, { home, cwd, streams: captureStreams().streams });
        if (registered) expect(run(["tap", "add", `file://${repo}//skills/docx`, "mine"])).toBe(0);
        const initialRef = registered ? "mine/docx" : `file://${repo}`;
        expect(run(["install", initialRef, "--scope", scope, "--agent", "claude-code"])).toBe(0);
        const before = readState(home).installations.find((entry) => entry.name === "docx")!;
        const retainedTap = readConfig(home).taps.find((tap) => tap.name === before.source.tap)!;
        if (mode === "changed-sha") {
          appendFileSync(join(repo, "skills", "docx", "SKILL.md"), "\nUpdated content.\n");
          commitAll(repo, "change docx");
          // A second tap shares the existing cache; refresh its bytes explicitly (§6).
          expect(run(["tap", "update", retainedTap.name])).toBe(0);
        }
        const incomingRef = registered ? `file://${repo}` : `file://${repo}//skills/docx`;
        const args = ["install", incomingRef, "--scope", scope, "--agent", "claude-code"];
        if (mode === "force") args.push("--force");
        if (mode === "new-agent") args.push("--agent", "codex");
        expect(run(args)).toBe(0);
        const after = readState(home).installations.find((entry) => entry.name === "docx")!;
        expect(after.source).toEqual(before.source);
        if (mode === "changed-sha") expect(after.resolved_sha).not.toBe(before.resolved_sha);
        const roots = [scope === "user" ? claudeRoot : join(cwd, ".claude", "skills")];
        if (mode === "new-agent")
          roots.push(scope === "user" ? codexRoot : join(cwd, ".codex", "skills"));
        for (const root of roots) {
          const marker = JSON.parse(
            readFileSync(join(root, "docx", ".crew.json"), "utf8"),
          ) as Marker;
          expect(marker.tap_name).toBe(retainedTap.name);
          expect(marker.tap_kind).toBe(retainedTap.kind);
          expect(marker.tap_url).toBe(retainedTap.url);
          expect(marker.tap_subpath).toBe(retainedTap.subpath);
          expect(marker.tap_path).toBe(retainedTap.path);
          expect(marker.path).toBe(before.source.path);
          expect(marker.resolved_sha).toBe(after.resolved_sha);
        }
      });
    }
  }
}
