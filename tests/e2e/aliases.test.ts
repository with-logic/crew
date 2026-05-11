/**
 * Top-level command aliases.
 *
 * Implements PRD §5.1 by locking user-facing top-level shortcuts to
 * their canonical command behavior.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

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
});
