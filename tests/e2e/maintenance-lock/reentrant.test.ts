/** Nested synchronous source consumers retain the outer maintenance lease (§14). */

import { afterEach, expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  detect: adapter.detect,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
}));
afterEach(() => {
  for (const saved of originals) {
    saved.adapter.detect = saved.detect;
    saved.adapter.userPath = saved.userPath;
    saved.adapter.projectPath = saved.projectPath;
  }
});

for (const missing of [false, true]) {
  test(`C-CONC-05 nested source ${missing ? "failure" : "success"} preserves outer coordination`, () => {
    const home = makeCrewHome();
    writeConfig({ ...readConfig(home), taps: [] }, home);
    const target = makeTempDir();
    const targetPath = () => target;
    for (const adapter of ALL_AGENTS) {
      adapter.detect = () => adapter.name === "claude-code";
      adapter.userPath = targetPath;
      adapter.projectPath = targetPath;
    }
    const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    const inspected = makeSkill(makeTempDir(), "other", skillFrontmatter({ name: "other" }));
    const homeAlias = join(makeTempDir(), "home");
    symlinkSync(home, homeAlias);
    const inner = captureStreams();
    const outer = captureStreams();
    const previous = process.env["CREW_LOCK_TIMEOUT_MS"];
    process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
    let nestedCode = -1;
    let collectorCode = -1;
    let called = false;
    try {
      const code = runCli(["install", source, "--verbose", "--agent", "claude-code"], {
        home,
        streams: {
          stdout: outer.streams.stdout,
          stderr: (line) => {
            outer.streams.stderr(line);
            if (called || !line.includes("staging ")) return;
            called = true;
            nestedCode = runCli(["info", missing ? `${inspected}/missing` : inspected, "--json"], {
              home: homeAlias,
              streams: inner.streams,
            });
            expect(
              runCli(["cache", "clean", "--dry-run"], {
                home,
                streams: captureStreams().streams,
              }),
            ).toBe(0);
            const external = Bun.spawnSync(
              [
                process.execPath,
                "-e",
                `
const {ALL_AGENTS}=await import(${JSON.stringify(new URL("../../../src/agents/registry.ts", import.meta.url).href)});
const {runCli}=await import(${JSON.stringify(new URL("../../../src/cli/main.ts", import.meta.url).href)});
for(const adapter of ALL_AGENTS){
 adapter.detect=()=>false;
 adapter.userPath=()=>${JSON.stringify(target)};
 adapter.projectPath=()=>${JSON.stringify(target)};
}
process.exitCode=runCli(["cache","clean","--json"],{home:${JSON.stringify(home)}});
`,
              ],
              { env: process.env, stdout: "pipe", stderr: "pipe" },
            );
            expect(external.exitCode).toBe(7);
            expect(JSON.parse(external.stdout.toString()).error.name).toBe("state_locked");
            // A nested collector must still wait while the outer source bytes are live.
            for (const args of [["cache", "clean"], ["update"], ["doctor", "--repair"]]) {
              const collector = captureStreams();
              collectorCode = runCli([...args, "--json"], { home, streams: collector.streams });
              expect(collectorCode).toBe(7);
              const error = JSON.parse(collector.stdout()).error;
              expect(error.name).toBe("state_locked");
              expect(error.details.lockPath).toBe(join(paths(home).locksDir, "maintenance.lock"));
            }
          },
        },
      });
      expect(code).toBe(0);
      expect(called).toBe(true);
      expect(nestedCode, inner.stdout()).toBe(missing ? 4 : 0);
      expect(collectorCode).toBe(7);
      expect(runCli(["cache", "clean"], { home, streams: captureStreams().streams })).toBe(0);
    } finally {
      if (previous === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
      else process.env["CREW_LOCK_TIMEOUT_MS"] = previous;
    }
  });
}
