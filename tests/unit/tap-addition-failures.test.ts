/** Re-expansion isolates new-child failures and reports empty target sets (§10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { readConfig } from "../../src/config/load.ts";
import { CrewError } from "../../src/core/errors.ts";
import type { StateFile } from "../../src/core/types.ts";
import { installNewTapChild } from "../../src/install/install-new-tap-child/index.ts";
import { reexpandTaps } from "../../src/install/tap-reexpand/index.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const original = { ...claudeCodeAdapter };
let home: string;
let root: string;
let state: StateFile;
beforeEach(() => {
  home = makeCrewHome();
  root = makeTempDir("crew-addition-source-");
  const agentRoot = makeTempDir("crew-addition-target-");
  claudeCodeAdapter.userPath = () => agentRoot;
  claudeCodeAdapter.detect = () => true;
  for (const name of ["seed", "newbie", "other"]) makeSkill(root, name, skillFrontmatter({ name }));
  const { entry } = installNewTapChild(
    {
      skillDir: join(root, "seed"),
      skillName: "seed",
      tapRelativePath: "seed",
      scope: "user",
      tap: { name: "local", kind: "path", registered: true, path: root, url: "", subpath: "" },
      agents: ["claude-code"],
      resolvedSha: null,
      projectRoot: null,
      ref: null,
      pinned: false,
    },
    false,
    home,
    home,
  );
  state = { schema_version: 1, installations: [entry!] };
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

function config() {
  return {
    ...readConfig(home),
    taps: [
      { name: "local", kind: "path" as const, registered: true, path: root, url: "", subpath: "" },
    ],
  };
}

test("C-UPD-18i a real staging failure is reported while later children install", () => {
  const result = reexpandTaps(state, config(), home, null, (args) => {
    const blocked = args.skillName === "newbie";
    if (blocked) chmodSync(args.skillDir, 0);
    try {
      return installNewTapChild(args, false, home, home);
    } finally {
      if (blocked) chmodSync(args.skillDir, 0o755);
    }
  });
  expect(result.hardFailure).toBe(true);
  expect(result.rows.find((row) => row.name === "newbie")).toMatchObject({
    kind: "tap_error",
    error: { code: "source_unreachable" },
  });
  expect(result.added.map((entry) => entry.name)).toEqual(["other"]);
});

test("C-UPD-18i a child with no applicable targets is a visible failure", () => {
  const result = reexpandTaps(state, config(), home, null, () => ({ entry: null, perTarget: [] }));
  expect(result.hardFailure).toBe(true);
  expect(result.added).toEqual([]);
  expect(result.rows).toHaveLength(2);
  for (const row of result.rows)
    expect(row).toMatchObject({ kind: "tap_error", error: { code: "no_agents" }, per_target: [] });
});

test("C-UPD-18i an install callback's domain error keeps its stable error code", () => {
  const result = reexpandTaps(state, config(), home, null, (args) => {
    if (args.skillName === "newbie")
      throw new CrewError("name_conflict", "other source owns newbie");
    return installNewTapChild(args, false, home, home);
  });
  expect(result.hardFailure).toBe(true);
  expect(result.rows.find((row) => row.name === "newbie")).toMatchObject({
    kind: "tap_error",
    error: { code: "name_conflict", message: "other source owns newbie" },
  });
  expect(result.added.map((entry) => entry.name)).toEqual(["other"]);
});
