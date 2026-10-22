/** C-UPD-47 newly discovered staging failures retain explicit hints and retry safely (§10.1.1, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { hashSourceDirectory } from "../../../src/sources/read.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { FILE_HINT, immutable, invoke, removeOfflineCore, sourceFailure } from "./helpers.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target = "";
beforeEach(() => {
  target = makeTempDir("crew-remedy-child-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

test("C-UPD-47 a denied new-child asset keeps its hint, failed-child absence and retry behavior", () => {
  const home = makeCrewHome();
  const root = makeTempDir();
  makeSkill(root, "existing", skillFrontmatter({ name: "existing" }));
  expect(invoke(home, ["install", root, "--agent", "claude-code"]).code).toBe(0);
  removeOfflineCore(home);
  const child = makeSkill(root, "new-child", skillFrontmatter({ name: "new-child" }));
  const asset = join(child, "asset.txt");
  writeFileSync(asset, "retry child asset");
  const frozen = immutable(home, target);
  chmodSync(asset, 0);
  try {
    const failure = sourceFailure(() => hashSourceDirectory(child));
    expect(failure).toBeInstanceOf(CrewError);
    const cause = failure as CrewError;
    expect(cause.code).toBe("source_unreachable");
    expect(cause.message).toContain("EACCES");
    expect(cause.remedy).toBe(FILE_HINT);
    const json = invoke(home, ["update", "--json"]);
    expect(json.code).toBe(1);
    const payload = JSON.parse(json.stdout);
    const row = payload.tap_reexpand_rows.find((r: { name: string }) => r.name === "new-child");
    expect(row).toMatchObject({
      name: "new-child",
      scope: "user",
      kind: "tap_error",
      error: { code: cause.code, message: cause.message, remedy: FILE_HINT },
    });
    expect(row).not.toHaveProperty("project_root");
    expect(payload.tap_reexpand_rows).toHaveLength(1);
    const human = invoke(home, ["update"]);
    const quiet = invoke(home, ["update", "--quiet"]);
    expect(human.code).toBe(1);
    expect(human.stdout).toContain(cause.message);
    expect(human.stdout).toContain(`  Next step: ${FILE_HINT}`);
    expect(quiet.code).toBe(1);
    expect(quiet.stdout).toBe("");
    expect(quiet.stderr).toContain(`${cause.message}; next step: ${FILE_HINT}`);
    expect(invoke(home, ["update", "--quiet", "--json"])).toEqual(json);
    expect(immutable(home, target)).toEqual(frozen);
    expect(readState(home).installations.some((entry) => entry.name === "new-child")).toBe(false);
    expect(existsSync(join(target, "new-child"))).toBe(false);
    // §10.1.1 previews validate metadata but do not stage new-child assets.
    for (const args of [
      ["update", "--dry-run", "--json"],
      ["outdated", "--json"],
    ]) {
      const preview = invoke(home, args);
      expect(preview.code).toBe(0);
      expect(JSON.parse(preview.stdout).tap_reexpand_rows).toContainEqual({
        name: "new-child",
        scope: "user",
        tap: row.tap,
        kind: "would_add",
      });
      expect(immutable(home, target)).toEqual(frozen);
    }
  } finally {
    chmodSync(asset, 0o600);
  }
  expect(invoke(home, ["update", "--json"]).code).toBe(0);
  expect(readFileSync(join(target, "new-child", "asset.txt"), "utf8")).toBe("retry child asset");
  expect(readState(home).installations.some((entry) => entry.name === "new-child")).toBe(true);
});
