/**
 * A repository whose root is one skill has no siblings, at a ref or not
 * (§9 step 3, step 6).
 *
 * Beside such a skill is crew's own clone directory, or — at `@<ref>` —
 * its scratch exports: other clones and exports, never the source. A bare
 * dependency must not be satisfied from there.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { tag } from "./helpers.ts";

let ccRoot = "";
let ccOriginal: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  ccRoot = makeTempDir("crew-root-sibling-agent-");
  ccOriginal = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = ccOriginal.userPath;
  claudeCodeAdapter.detect = ccOriginal.detect;
});

for (const ref of ["@v1", ""]) {
  test(`a root skill's bare dependency isn't taken from beside its clone (${ref || "no ref"})`, () => {
    const repo = makeTempDir("crew-root-skill-");
    const parent = skillFrontmatter({ name: "parent", dependencies: ["sib"] });
    writeFileSync(join(repo, "SKILL.md"), `---\n${parent}\n---\n`);
    makeGitRepo(repo, "one");
    tag(repo, "v1");

    const home = makeCrewHome();
    // Beside the clone sit other clones and crew's scratch exports: a
    // skill named `sib` in either must not count as a sibling.
    for (const beside of [
      join(paths(home).reposDir, "other"),
      join(paths(home).gitCacheDir, "x"),
    ]) {
      mkdirSync(beside, { recursive: true });
      writeFileSync(join(beside, "SKILL.md"), `---\n${skillFrontmatter({ name: "sib" })}\n---\n`);
    }

    const capture = captureStreams();
    const code = runCli(["install", `file://${repo}${ref}`, "--json"], {
      home,
      streams: capture.streams,
    });

    // Dependency resolution ran and found no `sib` — not a failure before it.
    expect(code).toBe(4);
    const { error } = JSON.parse(capture.stdout());
    expect(error.name).toBe("invalid_ref");
    expect(error.message).toContain("`sib` was not found");
    expect(existsSync(join(ccRoot, "sib"))).toBe(false);
  });
}
