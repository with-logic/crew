/**
 * `crew tap remove --dry-run` and the `untap` alias (§16.3, C-TAP-16b).
 * The preview reports what would go and keeps both the config row and
 * the local clone; the default-tap guard still fires.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { tapPath } from "../../../src/core/paths.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { buildTapRepo, configBytes, run } from "./helpers.ts";

describe("C-TAP-16b tap remove --dry-run", () => {
  test("git tap: reports, keeps the clone and the config row", () => {
    const home = makeCrewHome();
    const repo = buildTapRepo("crew-dry-remove-");
    run(home, ["tap", "add", `file://${repo}`, "mytap"]);
    const before = configBytes(home);
    const r = run(home, ["tap", "remove", "--dry-run", "mytap"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Would remove tap mytap");
    expect(r.stdout).toContain("local clone would be deleted");
    expect(existsSync(join(tapPath("mytap", home), ".git"))).toBe(true);
    expect(configBytes(home)).toBe(before);
  });

  test("untap alias + JSON", () => {
    const home = makeCrewHome();
    const dir = makeTempDir("crew-dry-remove-path-");
    mkdirSync(dir, { recursive: true });
    run(home, ["tap", "add", dir, "local"]);
    const r = run(home, ["untap", "--dry-run", "--json", "local"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ name: "local", dry_run: true });
    expect(readConfig(home).taps.some((t) => t.name === "local")).toBe(true);
  });

  test("path tap says the folder isn't touched", () => {
    const home = makeCrewHome();
    const dir = makeTempDir("crew-dry-remove-path2-");
    run(home, ["tap", "add", dir, "local"]);
    const r = run(home, ["tap", "remove", "--dry-run", "local"]);
    expect(r.stdout).toContain("wouldn't be touched");
  });

  test("default-tap guard and unknown-name error still fire", () => {
    const home = makeCrewHome();
    expect(run(home, ["tap", "remove", "--dry-run", "core"]).code).toBe(4);
    expect(readConfig(home).taps[0]!.name).toBe("core");
    const unknown = run(home, ["tap", "remove", "--dry-run", "nope"]);
    expect(unknown.code).toBe(4);
    expect(unknown.stderr).toContain("was not found");
  });
});
