/**
 * Coverage close-out for util/json, core/paths helpers, parseDuration, and readState after mutation.
 *
 * Branches the happy-path e2e suites do not reach; each test names the
 * file and line it keeps covered so a regression traces back here.
 */

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseDuration } from "../../../src/commands/autoupdate/duration.ts";
import {
  crewHome as crewHomeDefault,
  paths,
  storeEntryPath,
  tapPath,
} from "../../../src/core/paths.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { readJson, tryReadJson, writeJson } from "../../../src/util/json.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

describe("json utilities", () => {
  test("readJson throws on missing", () => {
    expect(() => readJson(`/tmp/missing-${Date.now()}`)).toThrow();
  });
  test("tryReadJson returns null on missing", () => {
    expect(tryReadJson(`/tmp/missing-${Date.now()}`)).toBeNull();
  });
  test("writeJson + readJson round-trip", () => {
    const d = makeTempDir();
    const f = join(d, "a.json");
    writeJson(f, { hello: "world" });
    expect(readJson<{ hello: string }>(f)).toEqual({ hello: "world" });
  });
  test("tryReadJson throws on invalid JSON", () => {
    const d = makeTempDir();
    const f = join(d, "a.json");
    writeFileSync(f, "not json");
    expect(() => tryReadJson(f)).toThrow();
  });
});

describe("paths helpers", () => {
  test("crewHome uses $CREW_HOME", () => {
    const prev = process.env["CREW_HOME"];
    try {
      process.env["CREW_HOME"] = "/tmp/custom-home";
      expect(crewHomeDefault()).toBe("/tmp/custom-home");
    } finally {
      if (prev === undefined) {
        delete process.env["CREW_HOME"];
      } else {
        process.env["CREW_HOME"] = prev;
      }
    }
  });
  test("crewHome defaults to ~/.crew when CREW_HOME absent", () => {
    const prev = process.env["CREW_HOME"];
    try {
      delete process.env["CREW_HOME"];
      expect(crewHomeDefault()).toBe(join(homedir(), ".crew"));
    } finally {
      if (prev !== undefined) {
        process.env["CREW_HOME"] = prev;
      }
    }
  });
  test("tapPath and storeEntryPath", () => {
    const home = "/tmp/crew-x";
    expect(tapPath("core", home)).toBe("/tmp/crew-x/taps/core");
    expect(storeEntryPath("demo", "abcdef12", home)).toBe("/tmp/crew-x/store/demo@abcdef12");
  });
  test("paths() shape", () => {
    const p = paths("/tmp/crew-x");
    expect(p.stateFile).toBe("/tmp/crew-x/state.json");
    expect(p.configFile).toBe("/tmp/crew-x/config.yaml");
  });
});

describe("parseDuration edge", () => {
  test("parseDuration covers every unit", () => {
    expect(parseDuration("10s")).toBe(10);
    expect(parseDuration("3m")).toBe(180);
    expect(parseDuration("1h")).toBe(3600);
    expect(parseDuration("2d")).toBe(172800);
  });
});

describe("readState post-mutation", () => {
  test("read/write round trip", () => {
    const home = makeCrewHome();
    writeState({ schema_version: 1, installations: [] }, home);
    const read = readState(home);
    expect(read.schema_version).toBe(1);
  });
});
