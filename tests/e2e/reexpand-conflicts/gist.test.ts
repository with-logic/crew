/** C-UPD-18j: a new gist file cannot replace an existing directory-source install (§5.4). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeTempDir } from "../../helpers/fixtures.ts";
import { GIST_URL, gistFile, makeGist } from "../gist/helpers.ts";
import { createTap, invoke } from "./fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let agentRoot = "";
beforeEach(() => {
  agentRoot = makeTempDir("crew-gist-conflict-agent-");
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
  resetGitRunner();
});

for (const dryRun of [false, true]) {
  test(`C-UPD-18j a new gist child rejects foreign provenance despite --force (dryRun=${dryRun})`, () => {
    const home = makeCrewHome();
    const cwd = makeTempDir("crew-gist-conflict-cwd-");
    const { repo } = makeGist({ "alpha.md": gistFile("alpha") });
    const foreign = createTap("foreign", "shared");
    expect(invoke(home, ["tap", "add", GIST_URL, "snippets"], cwd).code).toBe(0);
    expect(invoke(home, ["tap", "add", `file://${foreign}`, "foreign"], cwd).code).toBe(0);
    for (const tap of ["snippets", "foreign"])
      expect(invoke(home, ["install", tap, "--agent", "claude-code"], cwd).code).toBe(0);
    const before = readState(home).installations.find((entry) => entry.name === "shared")!;
    const manifest = join(agentRoot, "shared", "SKILL.md");
    const marker = join(agentRoot, "shared", ".crew.json");
    const bytes = readFileSync(manifest, "utf8");
    const provenance = readFileSync(marker, "utf8");
    writeFileSync(join(repo, "shared.md"), gistFile("shared", "foreign replacement"));
    commitAll(repo, "add conflicting gist child");
    const result = invoke(
      home,
      ["update", "snippets", "--force", "--json", ...(dryRun ? ["--dry-run"] : [])],
      cwd,
    );
    expect(result.code).toBe(1);
    expect(JSON.parse(result.stdout).tap_reexpand_rows).toContainEqual(
      expect.objectContaining({
        name: "shared",
        kind: "tap_error",
        error: expect.objectContaining({ code: "name_conflict" }),
      }),
    );
    expect(readFileSync(manifest, "utf8")).toBe(bytes);
    expect(readFileSync(marker, "utf8")).toBe(provenance);
    expect(readState(home).installations.find((entry) => entry.name === "shared")).toEqual(before);
  });
}
