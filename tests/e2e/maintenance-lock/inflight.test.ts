/** Collectors cannot remove another CLI's staged store or live export (§14). */

import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import { finishInstall, pausedInstall, waitForBarrier } from "./helpers.ts";

for (const staged of [false, true]) {
  for (const collector of [["cache", "clean"], ["update"]]) {
    test(`C-CONC-05 ${collector.join(" ")} preserves in-flight ${staged ? "store and export" : "export"}`, async () => {
      const home = makeCrewHome();
      writeConfig({ ...readConfig(home), taps: [] }, home);
      const target = makeTempDir("crew-maintenance-target-");
      const repo = makeTempDir("crew-maintenance-git-");
      makeGitRepo(repo);
      makeSkill(repo, "beta", skillFrontmatter({ name: "beta" }), "git bytes");
      commitAll(repo, "skill");
      const source = makeSkill(
        makeTempDir(),
        "alpha",
        skillFrontmatter({ name: "alpha" }),
        "path bytes",
      );
      const refs = [...(staged ? [source] : []), `file://${repo}@main`];
      const barrier = join(makeTempDir("crew-maintenance-barrier-"), "ready");
      const child = pausedInstall(home, target, refs, barrier);
      const previousTimeout = process.env["CREW_LOCK_TIMEOUT_MS"];
      let result: Awaited<ReturnType<typeof finishInstall>>;
      try {
        expect(await waitForBarrier(barrier)).toBe(true);
        const exported = readFileSync(barrier, "utf8");
        expect(existsSync(join(exported, "beta", "SKILL.md"))).toBe(true);
        if (staged) expect(readdirSync(paths(home).storeDir)).toHaveLength(1);
        process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
        const output = captureStreams();
        expect(runCli([...collector, "--json"], { home, streams: output.streams })).toBe(7);
        expect(JSON.parse(output.stdout()).error.name).toBe("state_locked");
        expect(existsSync(join(exported, "beta", "SKILL.md"))).toBe(true);
        if (staged) expect(readdirSync(paths(home).storeDir)).toHaveLength(1);
      } finally {
        if (previousTimeout === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
        else process.env["CREW_LOCK_TIMEOUT_MS"] = previousTimeout;
        result = await finishInstall(child, barrier);
      }
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(readFileSync(join(target, "beta", "SKILL.md"), "utf8")).toContain("git bytes");
      if (staged)
        expect(readFileSync(join(target, "alpha", "SKILL.md"), "utf8")).toContain("path bytes");
      expect(runCli([...collector, "--json"], { home, streams: captureStreams().streams })).toBe(0);
      expect(existsSync(join(target, "beta", "SKILL.md"))).toBe(true);
    }, 20_000);
  }
}
