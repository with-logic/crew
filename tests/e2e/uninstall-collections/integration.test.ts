/** Collection uninstall safety after integration with dry-run/preflight (§7.4). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { addTap, buildTap, install, installed, quiet } from "./helpers.ts";

let originals: { user: () => string; project: (c: string) => string; detect: () => boolean };
beforeEach(() => {
  const root = makeTempDir("crew-cc-");
  originals = {
    user: claudeCodeAdapter.userPath,
    project: claudeCodeAdapter.projectPath,
    detect: claudeCodeAdapter.detect,
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => root;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
    join(c, ".claude", "skills");
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.user;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = originals.project;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
});

test("C-UNINST-21 qualified namespace never absorbs another tap's namespace", () => {
  const home = makeCrewHome();
  expect(addTap(home, buildTap("crew-qualified-a-", { marketing: ["alpha"] }), "acme")).toBe(0);
  expect(addTap(home, buildTap("crew-qualified-b-", { marketing: ["beta"] }), "other")).toBe(0);
  expect(install(home, ["acme"])).toBe(0);
  expect(install(home, ["other"])).toBe(0);
  expect(runCli(["uninstall", "acme/marketing"], { home, streams: quiet() })).toBe(0);
  expect(installed(home)).toEqual(["beta"]);
});

for (const args of [["acme"], ["--all", "--yes"]]) {
  test(`C-UNINST-19 ${args.join(" ")} dry-run preserves collection bytes and state`, () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-preview-", { ".": ["alpha", "beta"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);
    const before = readFileSync(join(home, "state.json"), "utf8");
    const cap = captureStreams();
    expect(
      runCli(["uninstall", "--dry-run", "--json", ...args], { home, streams: cap.streams }),
    ).toBe(0);
    expect(JSON.parse(cap.stdout()).dry_run).toBe(true);
    expect(readFileSync(join(home, "state.json"), "utf8")).toBe(before);
    expect(installed(home)).toEqual(["alpha", "beta"]);
    expect(runCli(["uninstall", ...args], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual([]);
  });
}

test("C-UNINST-04 missing selector prevalidates before removing a collection", () => {
  const home = makeCrewHome();
  expect(addTap(home, buildTap("crew-preflight-", { ".": ["alpha"] }), "acme")).toBe(0);
  expect(install(home, ["acme"])).toBe(0);
  const before = readFileSync(join(home, "state.json"), "utf8");
  expect(runCli(["uninstall", "acme", "missing"], { home, streams: quiet() })).toBe(6);
  expect(readFileSync(join(home, "state.json"), "utf8")).toBe(before);
  expect(runCli(["uninstall", "acme"], { home, streams: quiet() })).toBe(0);
});

for (const args of [["acme"], ["--all", "--yes"]]) {
  test(`C-UNINST-27 ${args.join(" ")} rejects malformed project root even with force`, () => {
    const home = makeCrewHome();
    const cwd = makeTempDir("crew-malformed-project-");
    expect(addTap(home, buildTap("crew-malformed-", { ".": ["alpha"] }), "acme")).toBe(0);
    expect(install(home, ["--scope", "project", "acme"], cwd)).toBe(0);
    const entry = readState(home).installations[0]!;
    writeState(
      { schema_version: 1, installations: [{ ...entry, project_root: "relative" }] },
      home,
    );
    const before = readFileSync(join(home, "state.json"), "utf8");
    const cap = captureStreams();
    expect(
      runCli(["uninstall", "--scope", "project", "--force", ...args], {
        home,
        cwd,
        streams: cap.streams,
      }),
    ).toBe(4);
    expect(cap.stderr()).toContain("project root");
    expect(readFileSync(join(home, "state.json"), "utf8")).toBe(before);
    expect(existsSync(join(cwd, ".claude", "skills", "alpha", "SKILL.md"))).toBe(true);
  });
}
