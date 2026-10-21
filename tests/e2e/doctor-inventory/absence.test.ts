/** Missing bases and ordinary files remain absent doctor inventory (§11.2, C-STATE-14). */
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetAutoupdatePlatform();
});

for (const scenario of ["missing", "base-file", "ancestor-file", "child-file"] as const) {
  test(`C-STATE-14 ${scenario} is ordinary absent inventory`, () => {
    const home = makeCrewHome();
    const root = makeTempDir();
    const base = join(root, "base");
    if (scenario === "base-file" || scenario === "ancestor-file") writeFileSync(base, "file");
    if (scenario === "child-file") {
      mkdirSync(base);
      writeFileSync(join(base, "ordinary-file"), "file");
    }
    for (const adapter of ALL_AGENTS) {
      adapter.userPath = () => (scenario === "ancestor-file" ? join(base, "skills") : base);
      adapter.projectPath = () => "";
      adapter.detect = () => false;
    }
    setAutoupdatePlatform("freebsd");
    const cap = captureStreams();
    expect(runCli(["doctor", "--json"], { home, cwd: root, streams: cap.streams })).toBe(0);
    expect(JSON.parse(cap.stdout()).findings).toEqual([]);
  });
}
