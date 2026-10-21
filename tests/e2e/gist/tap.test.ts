/** Gist tap discovery, previews, and qualified installs (§16.1; C-GIST-04). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { countSkills } from "../../../src/install/collision-check.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { GIST_URL, gistFile, makeGist } from "./helpers.ts";

const original = { ...claudeCodeAdapter };
let home: string;
let dest: string;
beforeEach(() => {
  home = makeCrewHome();
  dest = makeTempDir("crew-gist-agent-");
  claudeCodeAdapter.userPath = () => dest;
  claudeCodeAdapter.projectPath = claudeCodeAdapter.userPath;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  Object.assign(claudeCodeAdapter, original);
  resetGitRunner();
});

function cli(args: string[]) {
  const output = captureStreams();
  const code = runCli(args, { home, streams: output.streams });
  return { code, stdout: output.stdout(), stderr: output.stderr() };
}

test("C-GIST-04 registers, searches, previews, and installs declared names", () => {
  const bytes = gistFile("build");
  makeGist({ "SKILL.md": gistFile("prd"), "odd.filename": bytes });
  expect(cli(["tap", "add", GIST_URL, "snippets"]).code).toBe(0);
  expect(countSkills(readConfig(home).taps.find((tap) => tap.name === "snippets")!, home)).toBe(2);
  const search = cli(["search", "--tap", "snippets", "--json"]);
  expect(search.code).toBe(0);
  expect(
    JSON.parse(search.stdout)
      .hits.map((hit: { name: string }) => hit.name)
      .sort(),
  ).toEqual(["build", "prd"]);
  for (const reference of ["snippets", "snippets/build", GIST_URL]) {
    const info = cli(["info", reference, "--json"]);
    expect(info.code).toBe(0);
    expect(JSON.parse(info.stdout).skills.map((skill: { name: string }) => skill.name)).toContain(
      "build",
    );
  }
  expect(cli(["install", "snippets/build", "--agent", "claude-code"]).code).toBe(0);
  expect(readFileSync(join(dest, "build", "SKILL.md"), "utf8")).toBe(bytes);
  expect(readState(home).installations[0]!.source.path).toBe("odd.filename");
});
