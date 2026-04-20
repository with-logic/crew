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
    expect(c.taps).toEqual([
      {
        name: DEFAULT_TAP_NAME,
        kind: "git",
        registered: true,
        url: DEFAULT_TAP_URL,
        subpath: "",
        path: "",
      },
    ]);
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

  test("tap subpath, when present, must be a string", () => {
    expect(() => normalizeConfig({ taps: [{ name: "a", url: "x", subpath: 42 }] })).toThrow(
      CrewError,
    );
  });

  test("tap subpath is normalized (leading/trailing slashes stripped)", () => {
    // Both an all-slashes value (which collapses to empty) and a well-formed
    // value with stray slashes exercise the normalization path.
    const dropped = normalizeConfig({ taps: [{ name: "a", url: "x", subpath: "//" }] });
    expect(dropped.taps[0]!.subpath).toBe("");
    const kept = normalizeConfig({ taps: [{ name: "b", url: "x", subpath: "/skills/" }] });
    expect(kept.taps[0]!.subpath).toBe("skills");
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

  test("kind must be `git` or `path` when present", () => {
    expect(() => normalizeConfig({ taps: [{ name: "a", kind: "zip", url: "x" }] })).toThrow(
      CrewError,
    );
  });

  test("registered, when present, must be a boolean", () => {
    expect(() => normalizeConfig({ taps: [{ name: "a", url: "x", registered: "yes" }] })).toThrow(
      CrewError,
    );
  });

  test("kind: path tap parses successfully", () => {
    const c = normalizeConfig({
      taps: [{ name: "local", kind: "path", path: "/tmp/skills", registered: true }],
    });
    expect(c.taps[0]).toEqual({
      name: "local",
      kind: "path",
      registered: true,
      url: "",
      subpath: "",
      path: "/tmp/skills",
    });
  });

  test("kind: path requires a non-empty `path`", () => {
    expect(() => normalizeConfig({ taps: [{ name: "a", kind: "path" }] })).toThrow(CrewError);
    expect(() => normalizeConfig({ taps: [{ name: "a", kind: "path", path: "" }] })).toThrow(
      CrewError,
    );
  });
});
