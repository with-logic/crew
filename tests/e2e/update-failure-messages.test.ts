/** Real source permission failures retain useful normal output and retry state (§10.1, C-UPD-41). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { paths } from "../../src/core/paths.ts";
import type { UpdateRow } from "../../src/install/update/types.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target = "";
beforeEach(() => {
  target = makeTempDir("crew-failure-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

test("C-UPD-41 normal update shows the real permission reason while other selected rows continue", () => {
  const home = makeCrewHome();
  const source = makeSkill(makeTempDir(), "broken", skillFrontmatter({ name: "broken" }));
  const healthy = makeSkill(makeTempDir(), "healthy", skillFrontmatter({ name: "healthy" }));
  expect(
    runCli(["install", source, healthy, "--agent", "claude-code"], {
      home,
      streams: captureStreams().streams,
    }),
  ).toBe(0);
  const entry = readState(home).installations.find((e) => e.name === "broken");
  const markerPath = join(target, "broken", ".crew.json");
  const manifestPath = join(target, "broken", "SKILL.md");
  const marker = readFileSync(markerPath);
  const manifest = readFileSync(manifestPath);
  writeFileSync(join(source, "asset.txt"), "retry these bytes");
  writeFileSync(join(healthy, "asset.txt"), "healthy update");
  chmodSync(source, 0o111);
  try {
    const human = captureStreams();
    expect(runCli(["update", "broken", "healthy"], { home, streams: human.streams })).toBe(1);
    const stateAfterHuman = readFileSync(paths(home).stateFile);
    expect(readState(home).installations.find((e) => e.name === "broken")).toEqual(entry);
    expect(readFileSync(markerPath)).toEqual(marker);
    expect(readFileSync(manifestPath)).toEqual(manifest);
    expect(readFileSync(join(target, "healthy", "asset.txt"), "utf8")).toBe("healthy update");

    const json = captureStreams();
    expect(runCli(["update", "broken", "healthy", "--json"], { home, streams: json.streams })).toBe(
      1,
    );
    const result = JSON.parse(json.stdout()) as { rows: UpdateRow[] };
    const outcome = result.rows.find((row) => row.name === "broken")!.outcome;
    expect(outcome.kind).toBe("failed");
    const failed = outcome as Extract<UpdateRow["outcome"], { kind: "failed" }>;
    expect(failed.error.code).toBe("source_unreachable");
    expect(failed.error.message).toContain("EACCES");
    expect(failed.error.message).toContain(source);
    expect(readFileSync(paths(home).stateFile)).toEqual(stateAfterHuman);
    expect(readFileSync(markerPath)).toEqual(marker);
    expect(readFileSync(manifestPath)).toEqual(manifest);
    expect(human.stdout()).toContain(`source unreachable: ${failed.error.message}`);
    expect(human.stdout()).toContain("1 updated · 1 failure");
  } finally {
    chmodSync(source, 0o755);
  }
  expect(runCli(["update", "broken"], { home, streams: captureStreams().streams })).toBe(0);
  expect(readFileSync(join(target, "broken", "asset.txt"), "utf8")).toBe("retry these bytes");
});
