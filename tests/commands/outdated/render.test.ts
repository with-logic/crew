/** Re-expansion failures retain their child diagnostics in outdated output (PRD §10.1.1). */

import { expect, test } from "bun:test";
import { renderOutdated } from "../../../src/commands/outdated/render.ts";
import { makeStyler } from "../../../src/util/term.ts";

test("outdated distinguishes a child validation failure from a tap refresh warning", () => {
  const lines = renderOutdated(
    {
      rows: [],
      tapRows: [
        {
          kind: "failed",
          name: "catalog",
          url: "file:///unused-local-tap",
          error: { code: "source_unreachable", message: "refresh failed" },
        },
      ],
      tapReexpandRows: [
        {
          kind: "tap_error",
          name: "broken-child",
          scope: "user",
          tap: "catalog",
          error: { code: "invalid_skill", message: "description is required" },
        },
      ],
    },
    makeStyler(false),
  );

  expect(lines).toEqual([
    "[warn] couldn't refresh tap catalog (source_unreachable)",
    "  showing what's known from the last-fetched copy",
    "[warn] broken-child (from catalog) invalid_skill",
    "  description is required",
    "",
    "[warn] Nothing known to be out of date, but some collections couldn't be checked.",
  ]);
});

test("outdated omits the detail line for an empty re-expansion error message", () => {
  const lines = renderOutdated(
    {
      rows: [],
      tapRows: [],
      tapReexpandRows: [
        {
          kind: "tap_error",
          name: "broken-child",
          scope: "user",
          tap: "catalog",
          error: { code: "invalid_skill", message: "" },
        },
      ],
    },
    makeStyler(false),
  );

  expect(lines).toEqual([
    "[warn] broken-child (from catalog) invalid_skill",
    "",
    "[warn] Nothing known to be out of date, but some collections couldn't be checked.",
  ]);
});
