/**
 * How re-expansion failures read and count in `crew update` and `crew
 * outdated` (§10.1.1 step 1; C-SPEC-18, C-UPD-18e): a failed child is its
 * own line; a group that failed as a whole is shown once per distinct
 * failure — groups of one tap failing the same way are one fault, ones
 * failing differently are each shown and counted.
 */

import { expect, test } from "bun:test";
import { tapErrorBlocks } from "../../src/commands/update/rows.ts";
import type { TapErrorRow } from "../../src/install/tap-reexpand/types.ts";
import { makeStyler } from "../../src/util/term.ts";

/** Whole-group rows for members `names` of tap `acme`, at `scope`, failing with `code` and `message`. */
function groupRows(
  names: readonly string[],
  scope: "user" | "project",
  code: "source_unreachable" | "ref_not_found",
  message: string,
): TapErrorRow[] {
  return names.map((name) => ({
    name,
    scope,
    tap: "acme",
    kind: "tap_error",
    whole_group: true,
    error: { code, message },
  }));
}

const blocks = (rows: readonly TapErrorRow[]) => tapErrorBlocks(rows, "x", makeStyler(false));

test("C-SPEC-18 groups of one tap failing differently are each shown and counted", () => {
  const { lines, failures } = blocks([
    ...groupRows(["a", "b"], "user", "source_unreachable", "couldn't read `skills`"),
    ...groupRows(["a", "b"], "project", "ref_not_found", "`v1` is gone"),
  ]);
  expect(failures).toBe(2);
  expect(lines.filter((l) => l.startsWith("x couldn't re-expand tap acme"))).toEqual([
    "x couldn't re-expand tap acme (2 skills) source_unreachable",
    "x couldn't re-expand tap acme (2 skills) ref_not_found",
  ]);
  expect(lines).toContain("  `v1` is gone");
});

test("C-SPEC-18 groups of one tap failing the same way are one fault, counting each skill once", () => {
  const { lines, failures } = blocks([
    ...groupRows(["a", "b"], "user", "source_unreachable", "couldn't read `skills`"),
    ...groupRows(["a", "b"], "project", "source_unreachable", "couldn't read `skills`"),
  ]);
  expect([failures, lines[0]]).toEqual([
    1,
    "x couldn't re-expand tap acme (2 skills) source_unreachable",
  ]);
});

test("C-UPD-18e a failed child is its own line, with its next step, beside a group's", () => {
  const child: TapErrorRow = {
    name: "c",
    scope: "user",
    tap: "acme",
    kind: "tap_error",
    error: { code: "invalid_skill", message: "no description", remedy: "Add one." },
  };
  const { lines, failures } = blocks([
    child,
    ...groupRows(["a"], "project", "ref_not_found", "`v1` is gone"),
  ]);
  expect(failures).toBe(2);
  expect(lines.slice(0, 3)).toEqual([
    "x c (from acme) invalid_skill",
    "  no description",
    "  Add one.",
  ]);
});
