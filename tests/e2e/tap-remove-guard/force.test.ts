/**
 * `crew tap remove --force` keeping skills installed (§16.3, C-TAP-16e)
 * and the soft `tap_missing` update outcome it makes possible
 * (§10.1, C-UPD-12b).
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import {
  agentRoot,
  buildTapRepo,
  makeCrewHome,
  run,
  tapWithInstall,
  useTempAgentRoot,
} from "./helpers.ts";

useTempAgentRoot();

describe("C-TAP-16e tap remove --force keeps skills", () => {
  test("removes the tap, keeps the install, and warns", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);

    const r = run(home, ["tap", "remove", "--force", "mytap"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Removed tap mytap");
    expect(r.stdout).toContain("stayed installed: alpha (user)");
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
    expect(readConfig(home).taps.some((t) => t.name === "mytap")).toBe(false);
  });
});

describe("C-UPD-12b tap_missing", () => {
  test("update reports the orphaned skill softly and exits 0", () => {
    const home = makeCrewHome();
    expect(tapWithInstall(home, buildTapRepo())).toBe(0);
    expect(run(home, ["tap", "remove", "--force", "mytap"]).code).toBe(0);

    const r = run(home, ["update"]);

    expect(r.code).toBe(0);
    expect(r.stdout).toContain("tap removed");
    expect(r.stdout).toContain("1 with a removed tap");
    // The install and its state entry are left alone.
    expect(existsSync(join(agentRoot(), "alpha"))).toBe(true);
    expect(readState(home).installations).toHaveLength(1);
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
