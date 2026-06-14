/**
 * Regression tests for `runCli({ home })` path threading.
 *
 * Programmatic callers should be able to pass a home override without
 * mutating global process env or depending on ambient CREW_HOME.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

describe("runCli home path threading", () => {
  test("explicit home overrides ambient CREW_HOME for adapter paths", () => {
    const prev = process.env["CREW_HOME"];
    const polluted = makeTempDir("crew-polluted-home-");
    const home = makeCrewHome();
    const src = makeTempDir("crew-env-home-src-");
    makeSkill(src, "env-demo", skillFrontmatter({ name: "env-demo" }));
    mkdirSync(join(polluted, "inert-adapters", "claude-code", "env-demo"), {
      recursive: true,
    });
    try {
      process.env["CREW_HOME"] = polluted;
      const code = runCli(["install", join(src, "env-demo")], {
        home,
        streams: captureStreams().streams,
      });
      expect(code).toBe(0);
      expect(process.env["CREW_HOME"]).toBe(polluted);
      expect(existsSync(join(home, "inert-adapters", "claude-code", "env-demo"))).toBe(true);
      expect(existsSync(join(polluted, "inert-adapters", "claude-code", "env-demo"))).toBe(true);
    } finally {
      if (prev === undefined) {
        delete process.env["CREW_HOME"];
      } else {
        process.env["CREW_HOME"] = prev;
      }
    }
  });

  test("explicit home does not create CREW_HOME when it was absent", () => {
    const prev = process.env["CREW_HOME"];
    try {
      delete process.env["CREW_HOME"];
      const code = runCli(["version"], {
        home: makeCrewHome(),
        streams: captureStreams().streams,
      });
      expect(code).toBe(0);
      expect(process.env["CREW_HOME"]).toBeUndefined();
    } finally {
      if (prev !== undefined) {
        process.env["CREW_HOME"] = prev;
      }
    }
  });
});
