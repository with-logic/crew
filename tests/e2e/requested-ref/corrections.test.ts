/** Captured dependency commits, selected previews and hard acquisition failures (§9, §10.1). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { repoClonePath } from "../../../src/core/repo-path.ts";
import { runGit } from "../../../src/git/exec.ts";
import { updateOneEntry } from "../../../src/install/update/entry.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { retag, tag, twoCommitRepo } from "./helpers.ts";

let agentRoot = "";
let original: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  agentRoot = makeTempDir("crew-ref-corrections-agent-");
  original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
});

test("C-INST-05f a later root fetch cannot move a parent's sibling commit", () => {
  const home = makeCrewHome();
  const repo = makeTempDir("crew-captured-parent-");
  makeSkill(repo, "parent", skillFrontmatter({ name: "parent", dependencies: ["dep"] }));
  makeSkill(repo, "dep", skillFrontmatter({ name: "dep", description: "DEPENDENCY A" }));
  const { sha } = makeGitRepo(repo);
  expect(
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams }),
  ).toBe(0);
  writeFileSync(
    join(repo, "dep", "SKILL.md"),
    `---\n${skillFrontmatter({ name: "dep", description: "DEPENDENCY B" })}\n---\n`,
  );
  makeSkill(repo, "extra", skillFrontmatter({ name: "extra" }));
  commitAll(repo, "later root and dependency");
  tag(repo, "later");
  const cap = captureStreams();
  expect(
    runCli(["install", "acme/parent@main", "acme/extra@later"], { home, streams: cap.streams }),
  ).toBe(0);
  expect(readFileSync(join(agentRoot, "dep", "SKILL.md"), "utf8")).toContain("DEPENDENCY A");
  const dep = readState(home).installations.find((entry) => entry.name === "dep")!;
  expect(dep.resolved_sha).toBe(sha);
  expect(dep.ref).toBe("main");
  expect(dep.pinned).toBe(false);
});

for (const dryRun of [false, true]) {
  test(`C-UPD-16c unchanged tracked tag with failed export exits 1 (dry=${dryRun})`, () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    expect(
      runCli(["install", `file://${repo}@v1`], { home, streams: captureStreams().streams }),
    ).toBe(0);
    const state = readFileSync(join(home, "state.json"), "utf8");
    const body = readFileSync(join(agentRoot, "demo", "SKILL.md"), "utf8");
    rmSync(join(home, "cache"), { recursive: true, force: true });
    writeFileSync(join(home, "cache"), "not a directory\n");
    const cap = captureStreams();
    expect(
      runCli(["update", "--json", ...(dryRun ? ["--dry-run"] : [])], {
        home,
        streams: cap.streams,
      }),
    ).toBe(1);
    expect(cap.stdout()).toContain("source_unreachable");
    expect(readFileSync(join(home, "state.json"), "utf8")).toBe(state);
    expect(readFileSync(join(agentRoot, "demo", "SKILL.md"), "utf8")).toBe(body);
  });
}

test("C-INST-05e qualified preview includes only the selected namespace member", () => {
  const home = makeCrewHome();
  const repo = makeTempDir("crew-selected-preview-");
  makeSkill(
    join(repo, "skills", "marketing"),
    "email",
    skillFrontmatter({ name: "email", description: "MARKETING" }),
  );
  makeSkill(
    join(repo, "skills", "sales"),
    "email",
    skillFrontmatter({ name: "email", description: "SALES" }),
  );
  makeGitRepo(repo);
  tag(repo, "v1");
  expect(
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams }),
  ).toBe(0);
  const cap = captureStreams();
  expect(
    runCli(["info", "acme/marketing/email@v1", "--json"], { home, streams: cap.streams }),
  ).toBe(0);
  const payload = JSON.parse(cap.stdout()) as { skills: { description: string }[] };
  expect(payload.skills.map((skill) => skill.description)).toEqual(["MARKETING"]);
  expect(
    runCli(["install", "acme/marketing/email@v1"], { home, streams: captureStreams().streams }),
  ).toBe(0);
  expect(readFileSync(join(agentRoot, "email", "SKILL.md"), "utf8")).toContain("MARKETING");
});

test("C-UPD-04b acquiring a missing cached ref still skips a moved pinned tag without force", () => {
  const home = makeCrewHome();
  const { repo, shaA, shaB } = twoCommitRepo();
  expect(
    runCli(["install", `file://${repo}@v1//demo`], { home, streams: captureStreams().streams }),
  ).toBe(0);
  const state = readState(home);
  const entry = state.installations[0]!;
  const config = readConfig(home);
  const clone = repoClonePath(`file://${repo}`, home);
  const before = readFileSync(join(agentRoot, "demo", "SKILL.md"));
  expect(entry.resolved_sha).toBe(shaA);
  retag(repo, "v1");
  runGit(["tag", "-d", "v1"], { cwd: clone });

  // A ref missing from the cache is fetched by acquisition after the cheap peek misses.
  const result = updateOneEntry(entry, state, config, home, false, home);
  expect(result.row.outcome).toEqual({ kind: "skipped", reason: "pinned to tag; upstream moved" });
  expect(result.bumpHardFailure).toBe(false);
  expect(result.updatedState).toEqual(state);
  expect(readState(home)).toEqual(state);
  expect(readFileSync(join(agentRoot, "demo", "SKILL.md"))).toEqual(before);
  expect(runGit(["rev-parse", "v1"], { cwd: clone }).stdout.trim()).toBe(shaB);
});
