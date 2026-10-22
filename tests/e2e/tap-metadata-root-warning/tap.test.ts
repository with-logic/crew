/** C-STATE-16 tap metadata warnings preserve retained locations and output contracts (§11.1, §16.3). */
import { expect, test } from "bun:test";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { WARNING, withFixture } from "./fixture.ts";

test("C-STATE-16 recursive upgrade warns once and keeps unrelated usable roots in inventory", () => {
  withFixture(true, (f) => {
    const result = f.run(["tap", "add", "--recursive", f.sources[0]!, "tap-a"]);
    expect(result.code).toBe(0);
    f.assertLocations("tap-a", true);
    expect<unknown>(readState(f.home).installations.slice(-f.corrupt.length)).toEqual(f.corrupt);
    expect(result.stderr).toBe(WARNING);
    const before = f.snapshot();
    expect(f.run(["tap", "add", "--recursive", f.sources[0]!, "tap-a"]).stderr).toBe("");
    expect(f.snapshot()).toEqual(before);
  });
});

test("C-STATE-16 promotion uses pre-rename attribution and preserves corrupt roots", () => {
  withFixture(true, (f) => {
    const config = readConfig(f.home);
    writeConfig(
      { ...config, taps: config.taps.map((tap) => ({ ...tap, registered: false })) },
      f.home,
    );
    const result = f.run(["tap", "add", f.sources[0]!, "renamed"]);
    expect(result.code).toBe(0);
    f.assertLocations("renamed", false);
    expect<unknown>(readState(f.home).installations.slice(-f.corrupt.length)).toEqual(
      f.corrupt.map((entry) => ({ ...entry, source: { ...entry.source, tap: "renamed" } })),
    );
    expect(result.stderr).toBe(WARNING);
  });
});

for (const flags of [["--quiet"], ["--json"], ["--json", "--quiet"]]) {
  test(`C-STATE-16 tap warning preserves ${flags.join(" ")} output`, () => {
    withFixture(true, (f) => {
      const result = f.run(["tap", "add", "--recursive", ...flags, f.sources[0]!, "tap-a"]);
      expect(result.code).toBe(0);
      f.assertLocations("tap-a", true);
      if (flags.includes("--json")) {
        expect(JSON.parse(result.stdout)).toEqual({
          name: "tap-a",
          kind: "path",
          path: f.sources[0],
          updated: true,
          discovery: "recursive",
        });
        expect(result.stderr).toBe("");
      } else {
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe(WARNING);
      }
    });
  });
}

test("C-STATE-16 unrelated rejected project roots and malformed user roots stay silent", () => {
  withFixture(false, (f) => {
    expect(f.run(["tap", "add", "--recursive", f.sources[0]!, "tap-a"]).stderr).toBe("");
    f.assertLocations("tap-a", true);
  });
});

test("C-STATE-16 dry-run upgrades and promotions preserve bytes without warning", () => {
  withFixture(true, (f) => {
    const before = f.snapshot();
    expect(f.run(["tap", "add", "--recursive", "--dry-run", f.sources[0]!, "tap-a"]).stderr).toBe(
      "",
    );
    expect(f.snapshot()).toEqual(before);
    const config = readConfig(f.home);
    writeConfig(
      { ...config, taps: config.taps.map((tap) => ({ ...tap, registered: false })) },
      f.home,
    );
    const autoBefore = f.snapshot();
    expect(f.run(["tap", "add", "--dry-run", f.sources[0]!, "renamed"]).stderr).toBe("");
    expect(f.snapshot()).toEqual(autoBefore);
    f.assertLocations("tap-a", false);
  });
});

test("C-STATE-16 registration-only promotion is silent; explicit recursive promotion still warns", () => {
  withFixture(true, (f) => {
    const config = readConfig(f.home);
    const auto = { ...config, taps: config.taps.map((tap) => ({ ...tap, registered: false })) };
    writeConfig(auto, f.home);
    expect(f.run(["tap", "add", f.sources[0]!, "tap-a"]).stderr).toBe("");
    writeConfig(
      { ...auto, taps: auto.taps.map((tap) => ({ ...tap, discovery: "recursive" })) },
      f.home,
    );
    const result = f.run(["tap", "add", "--recursive", f.sources[0]!, "tap-a"]);
    f.assertLocations("tap-a", true);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe(WARNING);
  });
});
