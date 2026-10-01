/**
 * Unit test for the "everything looks good" branch of `renderDoctor`
 * (§11.2). End-to-end doctor runs almost never produce a zero-findings
 * result in practice — there's usually stale autoupdate state or an
 * orphaned store entry — so the branch is exercised directly here.
 */

import { describe, expect, test } from "bun:test";
import { renderDoctor } from "../../src/commands/doctor/render.ts";
import { makeStyler } from "../../src/util/term.ts";

const style = makeStyler(false);

describe("renderDoctor — empty-findings branch", () => {
  test("prints the OK line and a --verify hint when verify was not set", () => {
    const lines = renderDoctor(
      [],
      { repair: false, verify: false, dryRun: false, applied: false },
      style,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Everything looks good");
    expect(lines[1]).toContain("crew doctor --verify");
  });

  test("prints only the OK line when --verify was passed", () => {
    const lines = renderDoctor(
      [],
      { repair: false, verify: true, dryRun: false, applied: false },
      style,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Everything looks good");
  });
});

describe("renderDoctor — fresh locked repairs", () => {
  test("reports a successful repair absent from the initial findings", () => {
    const lines = renderDoctor(
      [],
      { repair: true, verify: false, dryRun: false, applied: true },
      style,
      [{ level: "ok", code: "autoupdate_loaded", message: "loaded the background updater" }],
    );
    expect(lines.join("\n")).toContain("1 finding addressed");
    expect(lines.join("\n")).toContain("loaded the background updater");
  });

  test("fresh scheduler failure does not subtract an unrelated successful state repair", () => {
    const lines = renderDoctor(
      [{ level: "warn", code: "orphan_store_entry", message: "unreferenced store entry" }],
      { repair: true, verify: false, dryRun: false, applied: true },
      style,
      [{ level: "error", code: "autoupdate_repair_failed", message: "scheduler unavailable" }],
    );
    expect(lines.join("\n")).toContain("1 finding addressed");
    expect(lines.join("\n")).toContain("1 finding left for you");
    expect(lines.join("\n")).toContain("scheduler unavailable");
  });
});
