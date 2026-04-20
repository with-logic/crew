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
    const lines = renderDoctor([], { repair: false, verify: false }, style);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Everything looks good");
    expect(lines[1]).toContain("crew doctor --verify");
  });

  test("prints only the OK line when --verify was passed", () => {
    const lines = renderDoctor([], { repair: false, verify: true }, style);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Everything looks good");
  });
});
