/**
 * Per-adapter path and detection sanity (§7.2): each registered adapter
 * resolves to its documented paths and detects itself via the documented
 * signals, checked against the expectations table.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { withOriginalAdapter } from "../../helpers/env.ts";

// Every adapter redirects its user path detection via $HOME. Swap in
// a throwaway HOME so the real `isDirectory` checks land on a
// controllable directory tree.
const realHome = process.env["HOME"];
let tempHome: string;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "crew-adapter-test-"));
  process.env["HOME"] = tempHome;
});

afterEach(() => {
  if (realHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = realHome;
});

import { EXPECTATIONS } from "./expectations.ts";

describe("target adapter paths (§7.2)", () => {
  test("every registered adapter has an expectation", () => {
    expect(ALL_AGENTS.length).toBe(EXPECTATIONS.length);
    for (const a of ALL_AGENTS) {
      expect(EXPECTATIONS.some((e) => e.name === a.name)).toBe(true);
    }
  });

  for (const exp of EXPECTATIONS) {
    test(`${exp.name} resolves user + project paths`, () => {
      withOriginalAdapter(exp.name, (a) => {
        expect(a.userPath()).toBe(join(tempHome, exp.userSuffix));
        if (exp.projectSuffix === "") {
          expect(a.projectPath("/tmp/proj")).toBe("");
        } else {
          expect(a.projectPath("/tmp/proj")).toBe(join("/tmp/proj", exp.projectSuffix));
        }
      });
    });

    test(`${exp.name} detect() false without fixtures`, () => {
      // Wipe PATH to zero so isOnPath can't accidentally trip on a
      // dev machine's global installs.
      const prevPath = process.env["PATH"];
      process.env["PATH"] = "";
      try {
        withOriginalAdapter(exp.name, (a) => {
          // Cursor also detects via /Applications/Cursor.app, which
          // may exist on a dev machine. In that case we can't assert
          // `false` here; the other "detect via fixture" test still
          // exercises the primary branch.
          if (exp.name === "cursor") {
            expect(typeof a.detect()).toBe("boolean");
          } else {
            expect(a.detect()).toBe(false);
          }
        });
      } finally {
        process.env["PATH"] = prevPath;
      }
    });

    test(`${exp.name} detect() true when config dir exists`, () => {
      for (const sub of exp.detectFixtures) {
        mkdirSync(join(tempHome, sub), { recursive: true });
      }
      const prevPath = process.env["PATH"];
      process.env["PATH"] = "";
      try {
        withOriginalAdapter(exp.name, (a) => {
          expect(a.detect()).toBe(true);
        });
      } finally {
        process.env["PATH"] = prevPath;
      }
    });
  }
});
