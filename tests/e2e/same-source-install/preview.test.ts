/** Dry-run re-attribution describes proposed changes and preserves markers (§5.4, §9). */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { buildRepo, install } from "./helpers.ts";

let cc: { root: string };
let ccOriginal: { userPath: () => string; detect: () => boolean };

beforeEach(() => {
  cc = { root: makeTempDir("crew-cc-") };
  ccOriginal = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => cc.root;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = ccOriginal.userPath;
  claudeCodeAdapter.detect = ccOriginal.detect;
});

describe("re-attribution preview", () => {
  test("C-INST-13b dry-run describes a proposed attribution without changing it", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx"]);
    expect(install(home, `file://${repo}//skills/docx`).code).toBe(0);
    const beforeState = readState(home);
    const beforeConfig = readConfig(home);
    const markerPath = join(cc.root, "docx", ".crew.json");
    const beforeMarker = readFileSync(markerPath, "utf8");
    const cap = captureStreams();
    expect(
      runCli(["install", `file://${repo}`, "--agent", "claude-code", "--dry-run"], {
        home,
        streams: cap.streams,
      }),
    ).toBe(0);
    expect(cap.stdout()).toContain("would track via");
    expect(cap.stdout()).toContain("(dry run)");
    expect(cap.stdout()).not.toContain("now tracked via");
    expect(readState(home)).toEqual(beforeState);
    expect(readConfig(home)).toEqual(beforeConfig);
    expect(readFileSync(markerPath, "utf8")).toBe(beforeMarker);
  });
});
