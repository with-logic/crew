import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import {
  DEFAULT_AUTOUPDATE_INTERVAL_SECONDS,
  DEFAULT_TAP_NAME,
  DEFAULT_TAP_URL,
  defaultConfig,
} from "../../src/config/defaults.ts";
import { normalizeConfig, readConfig, writeConfig } from "../../src/config/load.ts";
import { CrewError } from "../../src/core/errors.ts";
import { paths } from "../../src/core/paths.ts";
import { makeCrewHome } from "../helpers/env.ts";

describe("readConfig", () => {
  test("missing file returns defaults", () => {
    const home = makeCrewHome();
    const c = readConfig(home);
    expect(c.taps).toEqual([{ name: DEFAULT_TAP_NAME, url: DEFAULT_TAP_URL }]);
    expect(c.disabled_targets).toEqual([]);
    expect(c.forced_targets).toEqual([]);
    expect(c.autoupdate).toEqual({
      enabled: false,
      interval_seconds: DEFAULT_AUTOUPDATE_INTERVAL_SECONDS,
    });
  });

  test("invalid YAML throws config_invalid", () => {
    const home = makeCrewHome();
    require("node:fs").mkdirSync(home, { recursive: true });
    writeFileSync(paths(home).configFile, "taps:\n\tbad-indent");
    expect(() => readConfig(home)).toThrow(CrewError);
  });

  test("round-trip writeConfig + readConfig", () => {
    const home = makeCrewHome();
    const c = defaultConfig();
    writeConfig({ ...c, disabled_targets: ["codex"], forced_targets: ["claude-code"] }, home);
    const read = readConfig(home);
    expect(read.disabled_targets).toEqual(["codex"]);
    expect(read.forced_targets).toEqual(["claude-code"]);
  });
});

describe("normalizeConfig", () => {
  test("null returns defaults", () => {
    expect(normalizeConfig(null)).toEqual(defaultConfig());
  });

  test("non-mapping throws", () => {
    expect(() => normalizeConfig(["a"])).toThrow(CrewError);
  });

  test("taps must be a list", () => {
    expect(() => normalizeConfig({ taps: "foo" })).toThrow(CrewError);
  });

  test("tap entry must be a mapping", () => {
    expect(() => normalizeConfig({ taps: ["string"] })).toThrow(CrewError);
  });

  test("tap entry requires name and url", () => {
    expect(() => normalizeConfig({ taps: [{ url: "x" }] })).toThrow(CrewError);
    expect(() => normalizeConfig({ taps: [{ name: "x" }] })).toThrow(CrewError);
  });

  test("disabled_targets must be a list of strings", () => {
    expect(() => normalizeConfig({ disabled_targets: "foo" })).toThrow(CrewError);
    expect(() => normalizeConfig({ disabled_targets: [42] })).toThrow(CrewError);
  });

  test("autoupdate must be a mapping", () => {
    expect(() => normalizeConfig({ autoupdate: "foo" })).toThrow(CrewError);
  });

  test("autoupdate.enabled type checked", () => {
    expect(() => normalizeConfig({ autoupdate: { enabled: "yes" } })).toThrow(CrewError);
  });

  test("autoupdate.interval_seconds type checked", () => {
    expect(() => normalizeConfig({ autoupdate: { interval_seconds: -1 } })).toThrow(CrewError);
    expect(() => normalizeConfig({ autoupdate: { interval_seconds: "fast" } })).toThrow(CrewError);
  });

  test("missing taps returns default tap", () => {
    const c = normalizeConfig({ disabled_targets: [] });
    expect(c.taps[0]!.name).toBe(DEFAULT_TAP_NAME);
  });
});
