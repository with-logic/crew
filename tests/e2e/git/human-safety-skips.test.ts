/** C-UPD-39 human target skips stay distinct from successful updates (§10.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originals = {
  claude: { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
  codex: { userPath: codexAdapter.userPath, detect: codexAdapter.detect },
};
let claudeRoot: string;
let codexRoot: string;

beforeEach(() => {
  claudeRoot = makeTempDir("crew-human-skip-claude-");
  codexRoot = makeTempDir("crew-human-skip-codex-");
  claudeCodeAdapter.userPath = () => claudeRoot;
  claudeCodeAdapter.detect = () => true;
  codexAdapter.userPath = () => codexRoot;
  codexAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, originals.claude);
  Object.assign(codexAdapter, originals.codex);
});

for (const reason of ["customized", "untracked_directory", "inconsistent_marker"] as const) {
  for (const allSkipped of [false, true]) {
    test(`C-UPD-39 ${reason} with ${allSkipped ? "all targets" : "one target"} skipped is truthful`, () => {
      const home = makeCrewHome();
      const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
      expect(
        runCli(["install", source, "--agent", "claude-code", "--agent", "codex"], {
          home,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
      const roots = allSkipped ? [claudeRoot, codexRoot] : [codexRoot];
      for (const root of roots) {
        const dest = join(root, "demo");
        const markerPath = join(dest, ".crew.json");
        if (reason === "customized") writeFileSync(join(dest, "MINE.md"), "local notes");
        if (reason === "untracked_directory") rmSync(markerPath);
        if (reason === "inconsistent_marker") {
          const marker = readFileSync(markerPath, "utf8");
          writeFileSync(markerPath, marker.replace(/"name":\s*"demo"/, '"name":"another-skill"'));
        }
      }
      writeFileSync(join(source, "NEW.md"), "upstream bytes");
      const capture = captureStreams();
      expect(runCli(["update", "demo"], { home, streams: capture.streams })).toBe(0);
      const output = capture.stdout();
      expect(output).toContain(`codex: skipped (${reason})`);
      if (allSkipped) expect(output).toContain(`claude-code: skipped (${reason})`);
      expect(output.trim().split("\n").at(-1)).toBe(
        allSkipped ? "1 skipped" : "1 partially updated",
      );
      expect(output).not.toContain("failure");
      for (const root of roots) expect(existsSync(join(root, "demo", "NEW.md"))).toBe(false);
      if (!allSkipped) {
        expect(readFileSync(join(claudeRoot, "demo", "NEW.md"), "utf8")).toBe("upstream bytes");
      }
    });
  }
}
