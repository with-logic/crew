/** Linked install leaves and markers cannot authorize doctor repair (§11.2, C-STATE-14). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchctl.ts";
import { setAutoupdatePlatform } from "../../../src/autoupdate/scheduler.ts";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import {
  setEnabled,
  statefulLaunchctl,
  useSchedulerSeams,
} from "../doctor-repair-autoupdate/helpers.ts";

useSchedulerSeams();
const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
let target: string;
beforeEach(() => {
  target = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(target, adapter.name);
    adapter.projectPath = (root) => join(root, adapter.name);
    adapter.detect = () => false;
  }
  claudeCodeAdapter.detect = () => true;
  setAutoupdatePlatform("darwin");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
});

for (const scope of ["user", "project"] as const) {
  for (const boundary of ["install", "marker"] as const) {
    for (const link of ["live", "dangling", "looping"] as const) {
      test(`C-STATE-14 ${scope} ${link} ${boundary} link blocks every repair`, () => {
        const home = makeCrewHome();
        const cwd = makeTempDir();
        const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
        expect(
          runCli(["install", source, "--agent", "claude-code", "--scope", scope], {
            home,
            cwd,
            streams: captureStreams().streams,
          }),
        ).toBe(0);
        const install = join(scope === "user" ? target : cwd, "claude-code", "demo");
        const entry = boundary === "install" ? install : join(install, ".crew.json");
        const outside = makeTempDir();
        const preserved = join(outside, "preserved");
        renameSync(entry, preserved);
        writeFileSync(join(outside, "sentinel"), "external fixture must remain unchanged\n");
        const externalFiles = [
          join(outside, "sentinel"),
          ...(boundary === "install"
            ? [join(preserved, "SKILL.md"), join(preserved, ".crew.json")]
            : [preserved]),
        ];
        const outsideBefore = externalFiles.map((path) => readFileSync(path));
        const outsideNames = readdirSync(outside);
        const destination =
          link === "live" ? preserved : link === "dangling" ? join(outside, "missing") : entry;
        symlinkSync(destination, entry);
        setEnabled(home, true);
        const p = paths(home);
        mkdirSync(dirname(p.autoupdatePlist), { recursive: true });
        writeFileSync(p.autoupdatePlist, "scheduler bytes to preserve\n");
        const orphan = join(p.storeDir, "orphan@12345678");
        mkdirSync(orphan);
        writeFileSync(join(orphan, "sentinel"), "orphan content\n");
        const files = [p.stateFile, p.configFile, p.autoupdatePlist, join(orphan, "sentinel")];
        const before = files.map((path) => readFileSync(path));
        const calls: string[][] = [];
        setLaunchctlRunner(statefulLaunchctl(false, calls));
        for (const flags of [[], ["--repair"], ["--repair", "--dry-run"]]) {
          for (const json of [true, false]) {
            const cap = captureStreams();
            expect(
              runCli(["doctor", "--verify", ...flags, ...(json ? ["--json"] : [])], {
                home,
                cwd,
                streams: cap.streams,
              }),
            ).toBe(1);
            if (json) {
              const result = JSON.parse(cap.stdout());
              expect(result.findings).toContainEqual(
                expect.objectContaining({
                  level: "error",
                  code: "marker_invalid",
                  message: expect.stringContaining(entry),
                }),
              );
              if (flags.length === 1) expect(result.repairs).toEqual([]);
            } else {
              expect(cap.stdout()).toContain(entry);
              expect(cap.stdout()).toContain("repair is blocked");
              if (flags.includes("--dry-run"))
                expect(cap.stdout()).toContain("would address 0 findings");
            }
            expect(files.map((path) => readFileSync(path))).toEqual(before);
            expect(existsSync(orphan)).toBe(true);
            expect(calls.every((args) => args[0] === "list")).toBe(true);
            expect(readlinkSync(entry)).toBe(destination);
            expect(externalFiles.map((path) => readFileSync(path))).toEqual(outsideBefore);
            expect(readdirSync(outside)).toEqual(outsideNames);
          }
        }
      });
    }
  }
}
