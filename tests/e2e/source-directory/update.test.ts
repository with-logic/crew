/** Update isolates directory discovery failures and preserves affected installs (§10.1, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target: string;
beforeEach(() => {
  target = makeTempDir();
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const mode of [0o111, 0o444]) {
  for (const brokenFirst of [true, false]) {
    test(`update preserves an inaccessible tap group (${mode.toString(8)}, ${brokenFirst ? "first" : "last"})`, () => {
      const home = makeCrewHome();
      const brokenRoot = makeTempDir();
      makeSkill(brokenRoot, "broken", skillFrontmatter({ name: "broken" }));
      const healthyRoot = makeTempDir();
      const healthy = makeSkill(healthyRoot, "healthy", skillFrontmatter({ name: "healthy" }));
      const roots = brokenFirst ? [brokenRoot, healthyRoot] : [healthyRoot, brokenRoot];
      expect(
        runCli(["install", ...roots, "--agent", "claude-code"], {
          home,
          streams: captureStreams().streams,
        }),
      ).toBe(0);
      const before = readState(home).installations.find((entry) => entry.name === "broken");
      const marker = readFileSync(join(target, "broken", ".crew.json"));
      const manifest = readFileSync(join(target, "broken", "SKILL.md"));
      writeFileSync(join(healthy, "asset.txt"), "healthy update");
      makeSkill(healthyRoot, "new-child", skillFrontmatter({ name: "new-child" }));
      chmodSync(brokenRoot, mode);
      try {
        const capture = captureStreams();
        expect(runCli(["update", "--json"], { home, streams: capture.streams })).toBe(1);
        const result = JSON.parse(capture.stdout());
        expect(result.tap_reexpand_rows).toContainEqual(
          expect.objectContaining({
            name: "broken",
            kind: "tap_error",
            error: expect.objectContaining({ code: "source_unreachable" }),
          }),
        );
        expect(
          result.tap_reexpand_rows.some((row: { kind: string }) => row.kind === "source_gone"),
        ).toBe(false);
        const state = readState(home);
        expect(state.installations.find((entry) => entry.name === "broken")).toEqual(before);
        expect(readFileSync(join(target, "broken", ".crew.json"))).toEqual(marker);
        expect(readFileSync(join(target, "broken", "SKILL.md"))).toEqual(manifest);
        expect(readFileSync(join(target, "healthy", "asset.txt"), "utf8")).toBe("healthy update");
        expect(state.installations.some((entry) => entry.name === "new-child")).toBe(true);
      } finally {
        chmodSync(brokenRoot, 0o755);
      }
    });
  }
}

test("update isolates a nonlistable single-skill entry and preserves its bytes and state", () => {
  const home = makeCrewHome();
  const source = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  expect(
    runCli(["install", source, "--agent", "claude-code"], {
      home,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const before = readState(home);
  const marker = readFileSync(join(target, "demo", ".crew.json"));
  const manifest = readFileSync(join(target, "demo", "SKILL.md"));
  chmodSync(source, 0o111);
  try {
    const capture = captureStreams();
    expect(runCli(["update", "demo", "--json"], { home, streams: capture.streams })).toBe(1);
    const result = JSON.parse(capture.stdout());
    expect(result.rows[0].outcome).toMatchObject({
      kind: "failed",
      error: { code: "source_unreachable" },
    });
    expect(readState(home)).toEqual(before);
    expect(readFileSync(join(target, "demo", ".crew.json"))).toEqual(marker);
    expect(readFileSync(join(target, "demo", "SKILL.md"))).toEqual(manifest);
  } finally {
    chmodSync(source, 0o755);
  }
});
