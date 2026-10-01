/**
 * `crew tap remove --force` keeping skills installed (§16.3, C-TAP-16e)
 * and the soft `tap_missing` update outcome it makes possible
 * (§10.1, C-UPD-12b).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildTapRepo, makeCrewHome, run, tapWithInstall } from "./helpers.ts";

let ccRoot = "";
let ccOriginal: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  ccRoot = makeTempDir("crew-tap-remove-agent-");
  ccOriginal = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = ccOriginal.userPath;
  claudeCodeAdapter.detect = ccOriginal.detect;
});

describe("C-TAP-16e tap remove --force keeps skills", () => {
  test("removes the tap, keeps the install, and warns", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "--force", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Removed tap mytap");
    expect(r.stdout).toContain("stayed installed: alpha (user)");
    expect(existsSync(join(ccRoot, "alpha"))).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
  });
});

describe("C-UPD-12b tap_missing", () => {
  test("update reports the orphaned skill softly and exits 0", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    expect(run(home, ["tap", "remove", "--force", "mytap"]).code).toBe(0);

    const stateBefore = readState(home).installations;
    const skillBefore = readFileSync(join(ccRoot, "alpha", "SKILL.md"));
    const markerBefore = readFileSync(join(ccRoot, "alpha", ".crew.json"));
    const r = run(home, ["update"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("tap removed");
    expect(r.stdout).toContain("1 with a removed tap");
    // C-UPD-12b preserves bytes, marker, and every state field.
    expect(readFileSync(join(ccRoot, "alpha", "SKILL.md"))).toEqual(skillBefore);
    expect(readFileSync(join(ccRoot, "alpha", ".crew.json"))).toEqual(markerBefore);
    expect(readState(home).installations).toEqual(stateBefore);
  });

  test("JSON reports the outcome and names the missing tap", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    expect(run(home, ["tap", "remove", "--force", "mytap"]).code).toBe(0);

    const r = run(home, ["update", "--json"]);

    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout) as {
      rows: { name: string; outcome: { kind: string; tap?: string } }[];
    };
    expect(payload.rows[0]!.outcome.kind).toBe("tap_missing");
    expect(payload.rows[0]!.outcome.tap).toBe("mytap");
  });

  test("other skills still update in the same run", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo("alpha"), "gonetap")).toBe(0);
    const liveRepo = buildTapRepo("beta");
    expect(tapWithInstall(home, liveRepo, "livetap")).toBe(0);
    expect(run(home, ["tap", "remove", "--force", "gonetap"]).code).toBe(0);

    // Move `beta` upstream so the live tap has something to pull.
    makeSkill(liveRepo, "beta", skillFrontmatter({ name: "beta", description: "Beta, revised" }));
    commitAll(liveRepo, "revise beta");

    const r = run(home, ["update", "--json"]);

    expect(r.code).toBe(0);
    const payload = JSON.parse(r.stdout) as {
      rows: { name: string; outcome: { kind: string } }[];
    };
    const kinds = new Map(payload.rows.map((row) => [row.name, row.outcome.kind]));
    expect(kinds.get("alpha")).toBe("tap_missing");
    expect(kinds.get("beta")).toBe("updated");
  });
});
