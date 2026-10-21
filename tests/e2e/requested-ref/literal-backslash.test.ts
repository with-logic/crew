/** Literal source directory names must survive explicit-ref resolution (§9 step 3/5). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
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
  tagRepo,
} from "../../helpers/fixtures.ts";

let target = "";
let original: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  target = makeTempDir("crew-backslash-agent-");
  original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
});

test.each([
  ["a\\..\\..\\..\\..\\..\\outside", ""],
  ["team\\one\\two\\three\\four", "leaf"],
])("C-INST-05b recursive tap @ref preserves literal directory %s", (directory, leaf) => {
  const home = makeCrewHome();
  const repo = makeTempDir("crew-backslash-repo-");
  const skillPath = join("nested", directory, leaf);
  const source = makeSkill(repo, skillPath, skillFrontmatter({ name: "demo" }), "AT TAG\n");
  writeFileSync(join(source, "data\\literal.txt"), "tag asset\n");
  const { sha } = makeGitRepo(repo);
  tagRepo(repo, "v1");
  writeFileSync(join(source, "SKILL.md"), "deleted at HEAD\n");
  commitAll(repo, "remove tagged skill frontmatter");
  // The old separator rewrite redirects the first case into this sibling of cache/.
  makeSkill(home, "outside", skillFrontmatter({ name: "demo" }), "OUTSIDE COMMIT\n");
  const cap = captureStreams();
  expect(
    runCli(["tap", "add", `file://${repo}`, "local", "--recursive"], {
      home,
      streams: cap.streams,
    }),
  ).toBe(0);
  expect(
    runCli(["install", "local/demo@v1", "--agent", "claude-code"], {
      home,
      streams: cap.streams,
    }),
  ).toBe(0);
  expect(readFileSync(join(target, "demo", "SKILL.md"))).toEqual(
    Buffer.from(`---\n${skillFrontmatter({ name: "demo" })}\n---\nAT TAG\n`),
  );
  expect(readFileSync(join(target, "demo", "data\\literal.txt"), "utf8")).toBe("tag asset\n");
  const entry = readState(home).installations[0]!;
  expect(entry.source).toEqual({ tap: "local", path: skillPath });
  expect(entry.resolved_sha).toBe(sha);
  expect(entry.ref).toBe("v1");
});
