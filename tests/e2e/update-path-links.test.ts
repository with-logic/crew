/** Recorded path-source disappearance preserves installs during update (§10.1, C-UPD-11/12). */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let target: string;
let originalPath: typeof claudeCodeAdapter.userPath;
let originalDetect: typeof claudeCodeAdapter.detect;
beforeEach(() => {
  target = makeTempDir("crew-update-links-target-");
  originalPath = claudeCodeAdapter.userPath;
  originalDetect = claudeCodeAdapter.detect;
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalPath;
  claudeCodeAdapter.detect = originalDetect;
});

function fixture() {
  const home = makeCrewHome();
  const root = makeTempDir("crew-update-links-source-");
  const skill = makeSkill(root, "demo", skillFrontmatter({ name: "demo" }), "original\n");
  const healthy = makeSkill(root, "healthy", skillFrontmatter({ name: "healthy" }));
  const setupCodes: number[] = [];
  for (const args of [
    ["tap", "add", root, "fixture"],
    ["install", "fixture/demo", "fixture/healthy", "--agent", "claude-code"],
  ]) {
    setupCodes.push(runCli(args, { home, streams: captureStreams().streams }));
  }
  return { home, root, skill, healthy, setupCodes };
}

interface UpdateData {
  rows: { name: string; outcome: { kind: string; error?: { message: string } } }[];
}

describe("unresolvable recorded path sources", () => {
  for (const scenario of ["deleted", "dangling", "looping", "file", "ancestor-file"] as const) {
    for (const dryRun of [false, true]) {
      test(`C-UPD-11/12 ${scenario} source is gone; dry-run=${dryRun}`, () => {
        const { home, root, skill, healthy, setupCodes } = fixture();
        expect(setupCodes).toEqual([0, 0]);
        const before = readState(home).installations.find((entry) => entry.name === "demo");
        const installedPath = join(target, "demo", "SKILL.md");
        const markerPath = join(target, "demo", ".crew.json");
        const installed = readFileSync(installedPath);
        const marker = readFileSync(markerPath);
        rmSync(skill, { recursive: true });
        if (scenario === "dangling") symlinkSync("missing", skill);
        if (scenario === "looping") symlinkSync("demo", skill);
        if (scenario === "file") writeFileSync(skill, "no longer a directory");
        if (scenario === "ancestor-file") {
          writeFileSync(join(root, "blocker"), "regular file\n");
          symlinkSync("blocker/child", skill);
        }
        writeFileSync(join(healthy, "NEW.md"), "healthy update\n");

        const capture = captureStreams();
        const args = ["update", "--json", ...(dryRun ? ["--dry-run"] : [])];
        expect(runCli(args, { home, streams: capture.streams })).toBe(0);
        const data = JSON.parse(capture.stdout()) as UpdateData;
        expect(data.rows.find((row) => row.name === "demo")?.outcome.kind).toBe("source_gone");
        expect(data.rows.find((row) => row.name === "healthy")?.outcome.kind).toBe(
          dryRun ? "would_update" : "updated",
        );
        expect(readFileSync(installedPath)).toEqual(installed);
        expect(readFileSync(markerPath)).toEqual(marker);
        expect(readState(home).installations.find((entry) => entry.name === "demo")).toEqual(
          before,
        );
        if (!dryRun)
          expect(readFileSync(join(target, "healthy", "NEW.md"), "utf8")).toBe("healthy update\n");
      });
    }
  }

  test("C-UPD-16c permission errors remain hard failures rather than source_gone", () => {
    const { home, root, setupCodes } = fixture();
    expect(setupCodes).toEqual([0, 0]);
    const before = readState(home);
    const markerPath = join(target, "demo", ".crew.json");
    const marker = readFileSync(markerPath);
    chmodSync(root, 0o000);
    try {
      const capture = captureStreams();
      expect(runCli(["update", "demo", "--json"], { home, streams: capture.streams })).toBe(1);
      const data = JSON.parse(capture.stdout()) as UpdateData;
      expect(data.rows[0]?.outcome.kind).toBe("failed");
      expect(data.rows[0]?.outcome.error?.message).toContain("EACCES");
      expect(readState(home)).toEqual(before);
      expect(readFileSync(markerPath)).toEqual(marker);
    } finally {
      chmodSync(root, 0o755);
    }
  });
});
