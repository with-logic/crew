/**
 * What a real `crew doctor --repair` does and does not touch (§11.2).
 *
 * The preview counterparts live in `./doctor.test.ts`. These pin the
 * promises a repair makes about itself: it reports only what it
 * addressed, it leaves the unrepairable alone rather than deleting it,
 * and it declines to run at all when config can't be read.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setLaunchctlRunner } from "../../../src/autoupdate/launchd.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { paths } from "../../../src/core/paths.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { pinDoctorEnv, projectEntry, unpinDoctorEnv } from "./helpers.ts";

beforeEach(pinDoctorEnv);
afterEach(unpinDoctorEnv);

describe("C-STATE-12a doctor --repair reports only real repairs", () => {
  test("addressed count excludes what repair left behind", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    rmSync(project, { recursive: true, force: true });
    writeState({ schema_version: 1, installations: [projectEntry(project)] }, home);
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    writeFileSync(join(home, "store", "ghost@00000000", "f"), "abc");

    const c = captureStreams();
    const code = runCli(["doctor", "--repair"], { home, streams: c.streams });
    expect(code).toBe(0);
    // The orphan store entry is gone; the missing project root isn't,
    // and the summary says so instead of claiming both were addressed.
    expect(existsSync(join(home, "store", "ghost@00000000"))).toBe(false);
    expect(c.stdout()).toContain("1 finding addressed");
    expect(c.stdout()).toContain("1 finding left for you");
  });

  test("C-STATE-12b autoupdate drift is reported, not claimed as repaired", () => {
    const home = makeCrewHome();
    // Config defaults to autoupdate disabled, but the scheduler says
    // loaded — drift this branch reports and does not reconcile.
    setLaunchctlRunner(() => true);
    const c = captureStreams();
    const code = runCli(["doctor", "--repair"], { home, streams: c.streams });

    expect(code).toBe(0);
    expect(c.stdout()).toContain("0 findings addressed");
    expect(c.stdout()).toContain("1 finding left for you");

    // And the drift genuinely survives: a follow-up check still sees it.
    const after = captureStreams();
    runCli(["doctor", "--json"], { home, streams: after.streams });
    const codes = JSON.parse(after.stdout()).findings.map((f: { code: string }) => f.code);
    expect(codes).toEqual(["autoupdate_unexpectedly_loaded"]);
  });

  test("C-STATE-12c a missing project root keeps its state entry", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    rmSync(project, { recursive: true, force: true });
    writeState({ schema_version: 1, installations: [projectEntry(project)] }, home);

    runCli(["doctor", "--repair"], { home, streams: captureStreams().streams });

    // §11.2 check 8 leaves a moved project to the user; deleting the
    // entry would discard the only record of the install.
    const entries = readState(home).installations;
    expect(entries.map((e) => e.name)).toEqual(["demo"]);
    expect(entries[0]!.project_root).toBe(project);
  });

  test("C-STATE-12d an unparseable config reports the finding instead of throwing", () => {
    const home = makeCrewHome();
    const config = paths(home).configFile;
    writeFileSync(config, "taps: [oh no\n  bad: yaml: :\n");
    const before = Bun.file(config).size;

    const c = captureStreams();
    const code = runCli(["doctor", "--repair"], { home, streams: c.streams });

    // A doctor-style report at a non-zero exit, not a bare CrewError.
    expect(code).toBe(1);
    expect(c.stderr()).toBe("");
    expect(c.stdout()).toContain("config.yaml couldn't be parsed");
    expect(c.stdout()).not.toContain("Repaired what was fixable");
    // Repair rebuilds taps from markers, so it must not have run: the
    // unreadable file is still exactly as the user left it.
    expect(Bun.file(config).size).toBe(before);
  });

  test("a live install survives alongside a preserved missing-root entry", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "live", skillFrontmatter({ name: "live" }));
    runCli(["install", join(src, "live")], { home, streams: captureStreams().streams });
    const project = makeTempDir("crew-proj-");
    rmSync(project, { recursive: true, force: true });
    const installed = readState(home).installations;
    writeState({ schema_version: 1, installations: [...installed, projectEntry(project)] }, home);

    runCli(["doctor", "--repair"], { home, streams: captureStreams().streams });

    // The marker-backed install is kept because its marker matches; the
    // missing-root entry is kept because its marker was never readable.
    const names = readState(home)
      .installations.map((e) => e.name)
      .sort();
    expect(names).toEqual(["demo", "live"]);
  });

  test("a readable config still repairs and rewrites taps", () => {
    const home = makeCrewHome();
    mkdirSync(join(home, "store", "ghost@00000000"), { recursive: true });
    writeFileSync(join(home, "store", "ghost@00000000", "f"), "abc");

    const c = captureStreams();
    runCli(["doctor", "--repair"], { home, streams: c.streams });

    expect(c.stdout()).toContain("Repaired what was fixable");
    expect(existsSync(join(home, "store", "ghost@00000000"))).toBe(false);
    expect(readConfig(home).taps.length).toBeGreaterThan(0);
  });
});
