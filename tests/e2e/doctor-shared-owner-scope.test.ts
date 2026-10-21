/** Doctor accepts a scope alias established by another marker owner (§7.2, §11.2). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ampAdapter } from "../../src/agents/amp.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { ALL_AGENTS } from "../../src/agents/registry.ts";
import { resetAutoupdatePlatform, setAutoupdatePlatform } from "../../src/autoupdate/scheduler.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
let cwd: string;
beforeEach(() => {
  cwd = makeTempDir("crew-shared-scope-");
  for (const { adapter } of originals) {
    adapter.userPath = () => "";
    adapter.projectPath = () => "";
    adapter.detect = () => false;
  }
  ampAdapter.userPath = () => join(cwd, ".config", "amp", "skills");
  ampAdapter.projectPath = (root) => join(root, ".agents", "skills");
  ampAdapter.detect = () => true;
  codexAdapter.userPath = () => join(cwd, ".agents", "skills");
  codexAdapter.projectPath = (root) => join(root, ".agents", "skills");
  codexAdapter.detect = () => true;
  setAutoupdatePlatform("freebsd");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetAutoupdatePlatform();
});

for (const scope of ["user", "project"] as const) {
  test(`C-STATE-14 another owning adapter establishes the declared ${scope} scope`, () => {
    const home = makeCrewHome();
    const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    if (scope === "project") {
      ampAdapter.userPath = () => join(cwd, ".agents", "skills");
      ampAdapter.projectPath = (root) => join(root, ".amp", "skills");
    }
    for (const [installScope, agent] of [
      [scope === "user" ? "project" : "user", "amp"],
      [scope, "codex"],
    ] as const) {
      expect(
        runCli(["install", skill, "--scope", installScope, "--agent", agent], {
          home,
          cwd,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
    }
    const markerPath = join(cwd, ".agents", "skills", "demo", ".crew.json");
    const bytes = readFileSync(markerPath, "utf8");
    expect(JSON.parse(bytes)).toMatchObject({ scope, agents: ["amp", "codex"] });
    const diagnosis = captureStreams();
    runCli(["doctor", "--verify", "--json"], { home, cwd, streams: diagnosis.streams });
    expect(JSON.parse(diagnosis.stdout()).findings).not.toContainEqual(
      expect.objectContaining({ code: "marker_invalid" }),
    );
    for (const missingState of [false, true]) {
      if (missingState) rmSync(join(home, "state.json"));
      expect(
        runCli(["doctor", "--repair"], {
          home,
          cwd,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
      const entries = readState(home).installations;
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ scope, agents: ["amp", "codex"] });
      expect(entries[0]!.project_root).toBe(scope === "project" ? cwd : undefined);
      expect(readFileSync(markerPath, "utf8")).toBe(bytes);
      const checked = captureStreams();
      expect(
        runCli(["doctor", "--verify", "--json"], {
          home,
          cwd,
          streams: checked.streams,
        }),
      ).toBe(0);
      expect(JSON.parse(checked.stdout()).findings).toEqual([]);
    }
  });
}

test("C-STATE-14 an unrelated adapter cannot authorize a mismatched scope", () => {
  const home = makeCrewHome();
  const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  expect(
    runCli(["install", skill, "--scope", "project", "--agent", "amp"], {
      home,
      cwd,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const markerPath = join(cwd, ".agents", "skills", "demo", ".crew.json");
  writeFileSync(
    markerPath,
    JSON.stringify({
      ...JSON.parse(readFileSync(markerPath, "utf8")),
      scope: "user",
    }),
  );
  const paths = [join(home, "state.json"), join(home, "config.yaml"), markerPath];
  const bytes = paths.map((path) => readFileSync(path));
  const checked = captureStreams();
  expect(
    runCli(["doctor", "--repair", "--json"], {
      home,
      cwd,
      streams: checked.streams,
    }),
  ).toBe(1);
  expect(JSON.parse(checked.stdout()).findings).toContainEqual(
    expect.objectContaining({ code: "marker_invalid" }),
  );
  expect(JSON.parse(checked.stdout()).repairs).toEqual([]);
  expect(paths.map((path) => readFileSync(path))).toEqual(bytes);
});
