/** Source file read failures retain their operational identity (§9 steps 3–5, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target: string;
beforeEach(() => {
  target = makeTempDir("crew-source-read-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const file of ["SKILL.md", "asset.txt"]) {
  test(`unreadable source ${file} is source_unreachable, not invalid_skill`, () => {
    const home = makeCrewHome();
    const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    const blocked = join(skill, file);
    if (file === "asset.txt") writeFileSync(blocked, "asset bytes");
    chmodSync(blocked, 0);
    try {
      const capture = captureStreams();
      const exit = runCli(["install", skill, "--agent", "claude-code", "--json"], {
        home,
        streams: capture.streams,
      });
      expect(exit).toBe(5);
      expect(JSON.parse(capture.stdout()).error.name).toBe("source_unreachable");
      expect(capture.stdout()).toContain(file);
      expect(readState(home).installations).toHaveLength(0);
      expect(existsSync(join(target, "demo"))).toBe(false);
    } finally {
      chmodSync(blocked, 0o600);
    }
  });

  test(`update reports unreadable source ${file} without changing the install`, () => {
    const home = makeCrewHome();
    const skill = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
    const blocked = join(skill, file);
    if (file === "asset.txt") writeFileSync(blocked, "asset bytes");
    expect(
      runCli(["install", skill, "--agent", "claude-code"], {
        home,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    const before = readState(home);
    const manifestBefore = readFileSync(join(target, "demo", "SKILL.md"));
    const blockedBefore = readFileSync(join(target, "demo", file));
    chmodSync(blocked, 0);
    try {
      const capture = captureStreams();
      const exit = runCli(["update", "demo", "--json"], { home, streams: capture.streams });
      const result = JSON.parse(capture.stdout());
      expect(exit).toBe(1);
      expect(result.rows[0].outcome.error.code).toBe("source_unreachable");
      expect(readState(home)).toEqual(before);
      expect(readFileSync(join(target, "demo", "SKILL.md"))).toEqual(manifestBefore);
      expect(readFileSync(join(target, "demo", file))).toEqual(blockedBefore);
    } finally {
      chmodSync(blocked, 0o600);
    }
  });
}

for (const brokenFirst of [true, false]) {
  test(`an unreadable tracked manifest isolates its group (${brokenFirst ? "first" : "last"})`, () => {
    const home = makeCrewHome();
    const healthyRoot = makeTempDir();
    const healthy = makeSkill(healthyRoot, "healthy", skillFrontmatter({ name: "healthy" }));
    const brokenRoot = makeTempDir();
    const broken = makeSkill(brokenRoot, "broken", skillFrontmatter({ name: "broken" }));
    const roots = brokenFirst ? [brokenRoot, healthyRoot] : [healthyRoot, brokenRoot];
    expect(
      runCli(["install", ...roots, "--agent", "claude-code"], {
        home,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    const brokenBefore = readState(home).installations.find((entry) => entry.name === "broken");
    const brokenMarker = readFileSync(join(target, "broken", ".crew.json"), "utf8");
    const brokenManifest = readFileSync(join(target, "broken", "SKILL.md"));
    writeFileSync(join(healthy, "asset.txt"), "updated healthy bytes");
    makeSkill(healthyRoot, "new-child", skillFrontmatter({ name: "new-child" }));
    const manifest = join(broken, "SKILL.md");
    chmodSync(manifest, 0);
    try {
      const capture = captureStreams();
      expect(runCli(["update", "--json"], { home, streams: capture.streams })).toBe(1);
      const result = JSON.parse(capture.stdout());
      expect(result.rows).toContainEqual(
        expect.objectContaining({
          name: "broken",
          outcome: expect.objectContaining({
            kind: "failed",
            error: expect.objectContaining({ code: "source_unreachable" }),
          }),
        }),
      );
      expect(result.rows).toContainEqual(
        expect.objectContaining({
          name: "healthy",
          outcome: expect.objectContaining({ kind: "updated" }),
        }),
      );
      expect(result.tap_reexpand_rows).toContainEqual(
        expect.objectContaining({
          name: "broken",
          kind: "tap_error",
          error: expect.objectContaining({ code: "source_unreachable" }),
        }),
      );
      const state = readState(home);
      expect(state.installations.find((entry) => entry.name === "broken")).toEqual(brokenBefore);
      expect(readFileSync(join(target, "broken", ".crew.json"), "utf8")).toBe(brokenMarker);
      expect(readFileSync(join(target, "broken", "SKILL.md"))).toEqual(brokenManifest);
      expect(readFileSync(join(target, "healthy", "asset.txt"), "utf8")).toBe(
        "updated healthy bytes",
      );
      expect(state.installations.some((entry) => entry.name === "new-child")).toBe(true);
      expect(existsSync(join(target, "new-child", ".crew.json"))).toBe(true);
    } finally {
      chmodSync(manifest, 0o600);
    }
  });
}
