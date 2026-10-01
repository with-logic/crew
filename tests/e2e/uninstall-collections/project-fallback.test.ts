/** Collection selectors apply project fallback per skill (§7.4, C-UNINST-27). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
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

for (const selector of ["acme/marketing", "marketing"]) {
  test(`C-UNINST-27 ${selector} finds its lone project despite unrelated installs`, () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-selected-project-");
    const other = makeTempDir("crew-other-project-");
    const elsewhere = makeTempDir("crew-elsewhere-");
    expect(addTap(home, buildTap("crew-selected-", { marketing: ["alpha"] }), "acme")).toBe(0);
    expect(addTap(home, buildTap("crew-unrelated-", { ".": ["beta"] }), "other")).toBe(0);
    expect(install(home, ["--scope", "project", "acme"], project)).toBe(0);
    expect(install(home, ["--scope", "project", "other"], other)).toBe(0);
    expect(
      runCli(["uninstall", "--scope", "project", selector], {
        home,
        cwd: elsewhere,
        streams: quiet(),
      }),
    ).toBe(0);
    expect(installed(home)).toEqual(["beta"]);
    expect(existsSync(join(project, ".claude", "skills", "alpha"))).toBe(false);
    expect(existsSync(join(other, ".claude", "skills", "beta", ".crew.json"))).toBe(true);
  });
}

test.each(["acme", "acme/marketing", "marketing"])(
  "C-UNINST-27 %s applies fallback separately to each member",
  (selector) => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-many-project-");
    const elsewhere = makeTempDir("crew-elsewhere-");
    expect(addTap(home, buildTap("crew-many-", { marketing: ["alpha", "beta"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);
    expect(install(home, ["--scope", "project", "acme"], project)).toBe(0);
    expect(
      runCli(["uninstall", "--scope", "project", selector], {
        home,
        cwd: elsewhere,
        streams: quiet(),
      }),
    ).toBe(0);
    expect(installed(home)).toEqual(["alpha", "beta"]);
    expect(readState(home).installations.every((e) => e.scope === "user")).toBe(true);
    expect(existsSync(join(project, ".claude", "skills", "alpha"))).toBe(false);
    expect(existsSync(join(project, ".claude", "skills", "beta"))).toBe(false);
  },
);

test("C-UNINST-27 qualified namespace fallback ignores same-name installs in another tap", () => {
  const home = makeCrewHome();
  const project = makeTempDir("crew-identity-a-");
  const other = makeTempDir("crew-identity-b-");
  expect(addTap(home, buildTap("crew-identity-a-", { marketing: ["alpha"] }), "acme")).toBe(0);
  expect(addTap(home, buildTap("crew-identity-b-", { ".": ["alpha"] }), "other")).toBe(0);
  expect(install(home, ["--scope", "project", "acme"], project)).toBe(0);
  expect(install(home, ["--scope", "project", "other"], other)).toBe(0);
  expect(
    runCli(["uninstall", "--scope", "project", "acme/marketing"], {
      home,
      cwd: makeTempDir("crew-elsewhere-"),
      streams: quiet(),
    }),
  ).toBe(0);
  expect(readState(home).installations.map((e) => e.source.tap)).toEqual(["other"]);
  expect(existsSync(join(other, ".claude", "skills", "alpha", ".crew.json"))).toBe(true);
});

test.each([false, true])(
  "C-UNINST-19b excluded collection owners remain visible (dry: %s)",
  (dry) => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-retained-", { ".": ["alpha"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);
    const cap = captureStreams();
    expect(
      runCli(["uninstall", "acme", "--agent", "codex", ...(dry ? ["--dry-run"] : [])], {
        home,
        streams: cap.streams,
      }),
    ).toBe(0);
    expect(cap.stdout()).toContain("alpha");
    expect(cap.stdout()).toContain("claude-code");
    expect(cap.stdout()).toContain(dry ? "would keep" : "kept");
    expect(cap.stdout()).not.toContain("Nothing installed");
    expect(installed(home)).toEqual(["alpha"]);
  },
);
