/**
 * Top-level command aliases.
 *
 * Implements PRD §5.1 by locking user-facing top-level shortcuts to
 * their canonical command behavior.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

describe("top-level aliases", () => {
  test("crew skills is an alias for crew list", () => {
    const home = makeCrewHome();
    const list = captureStreams();
    const skills = captureStreams();
    expect(runCli(["list"], { home, streams: list.streams })).toBe(0);
    expect(runCli(["skills"], { home, streams: skills.streams })).toBe(0);
    expect(skills.stdout()).toBe(list.stdout());
  });

  test("crew taps is an alias for crew tap list", () => {
    const home = makeCrewHome();
    const tapList = captureStreams();
    const taps = captureStreams();
    expect(runCli(["tap", "list"], { home, streams: tapList.streams })).toBe(0);
    expect(runCli(["taps"], { home, streams: taps.streams })).toBe(0);
    expect(taps.stdout()).toBe(tapList.stdout());
  });

  test("crew untap is an alias for crew tap remove", () => {
    const home = makeCrewHome();
    const tapRemove = captureStreams();
    const untap = captureStreams();
    expect(runCli(["tap", "remove", "core", "--force"], { home, streams: tapRemove.streams })).toBe(
      0,
    );

    const otherHome = makeCrewHome();
    expect(runCli(["untap", "core", "--force"], { home: otherHome, streams: untap.streams })).toBe(
      0,
    );
    expect(untap.stdout()).toBe(tapRemove.stdout());
  });

  test("crew taps rejects extra positionals instead of silently listing taps", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    expect(runCli(["taps", "add"], { home, streams: c.streams })).toBe(4);
    expect(c.stderr()).toContain("`crew tap list` takes no arguments");
  });

  test("crew tap list rejects extra positionals", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    expect(runCli(["tap", "list", "core"], { home, streams: c.streams })).toBe(4);
    expect(c.stderr()).toContain("`crew tap list` takes no arguments");
  });

  test("crew untap requires the same arguments as crew tap remove", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    expect(runCli(["untap"], { home, streams: c.streams })).toBe(4);
    expect(c.stderr()).toContain("`crew tap remove` needs exactly one tap name");
  });

  test("C-CLI-01b crew ls is an alias for crew list", () => {
    const home = makeCrewHome();
    const list = captureStreams();
    const ls = captureStreams();
    expect(runCli(["list", "--json"], { home, streams: list.streams })).toBe(0);
    expect(runCli(["ls", "--json"], { home, streams: ls.streams })).toBe(0);
    expect(ls.stdout()).toBe(list.stdout());
    expect(JSON.parse(ls.stdout())).toEqual({ installations: [] });
  });

  test("C-CLI-01b crew upgrade is an alias for crew update", () => {
    const home = makeCrewHome();
    const update = captureStreams();
    const upgrade = captureStreams();
    expect(runCli(["update", "--json"], { home, streams: update.streams })).toBe(0);
    expect(runCli(["upgrade", "--json"], { home, streams: upgrade.streams })).toBe(0);
    expect(upgrade.stdout()).toBe(update.stdout());
    expect(JSON.parse(upgrade.stdout())).toHaveProperty("rows");
  });

  test("C-CLI-01b crew upgrade emits the scheduled-update status line", () => {
    // The §10.2 status line is keyed off the CANONICAL command, so an alias
    // has to reach it too — a scheduled run invoked as `crew upgrade` must
    // still be parseable by whatever reads the log. The `--json` alias test
    // above cannot cover this: §10.4's suppression rules silence the line
    // under `--json`, so only a non-JSON run exercises the branch.
    const saved = process.env["CREW_AUTOUPDATE_LOG"];
    process.env["CREW_AUTOUPDATE_LOG"] = "1";
    const c = captureStreams();
    const code = runCli(["upgrade", "--quiet"], { home: makeCrewHome(), streams: c.streams });
    if (saved === undefined) delete process.env["CREW_AUTOUPDATE_LOG"];
    else process.env["CREW_AUTOUPDATE_LOG"] = saved;
    expect(code).toBe(0);
    expect(c.stdout()).toBe("");
    expect(c.stderr()).toMatch(/^crew-autoupdate \S+ exit=0\n$/);
  });

  test("C-CLI-01b crew remove and crew rm are aliases for crew uninstall", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    expect(runCli(["remove", "ghost"], { home, streams: c.streams })).toBe(6);
    expect(c.stderr()).toContain("not_installed_here");
    const d = captureStreams();
    expect(runCli(["rm", "ghost"], { home, streams: d.streams })).toBe(6);
    expect(d.stderr()).toContain("not_installed_here");
  });

  test("C-CLI-01b crew rm accepts uninstall's own flags", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "alias-skill", skillFrontmatter({ name: "alias-skill" }));
    const install = captureStreams();
    expect(
      runCli(["install", join(src, "alias-skill"), "--agent", "claude-code"], {
        home,
        streams: install.streams,
      }),
    ).toBe(0);
    const rm = captureStreams();
    expect(
      runCli(["rm", "--prune", "--agent", "claude-code", "alias-skill", "--json"], {
        home,
        streams: rm.streams,
      }),
    ).toBe(0);
    expect(JSON.parse(rm.stdout()).records[0].name).toBe("alias-skill");
    const list = captureStreams();
    expect(runCli(["list", "--json"], { home, streams: list.streams })).toBe(0);
    expect(JSON.parse(list.stdout()).installations).toEqual([]);
  });

  test("C-CLI-01b alias flags are rejected on commands that don't own them", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    expect(runCli(["ls", "--prune"], { home, streams: c.streams })).toBe(4);
    expect(c.stderr()).toContain("Unknown argument: prune");
  });
});
