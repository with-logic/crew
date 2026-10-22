/** Quiet diagnostic escaping and non-error filtering (§5.2, §10.1, C-UPD-42). */

import { expect, test } from "bun:test";
import { renderQuietUpdateErrors } from "../../../../src/commands/update/diagnostics.ts";
import type { UpdatePlan } from "../../../../src/commands/update/plan.ts";

type DiagnosticInput = Pick<UpdatePlan, "rows" | "tapReexpandRows" | "tapRows" | "selectors">;

test("C-UPD-42 quiet formatting sanitizes every diagnostic value without mutating raw JSON", () => {
  const unsafe = "https://alice:password-secret@host/repo?token=query-secret\n\u0085";
  const input: DiagnosticInput = {
    rows: [
      {
        name: `skill-${unsafe}`,
        scope: "project",
        project_root: `root-${unsafe}`,
        outcome: {
          kind: "failed",
          error: { code: `code-${unsafe}`, message: `ordinary-${unsafe}` },
        },
      },
      {
        name: "partial",
        scope: "user",
        outcome: {
          kind: "updated",
          new_sha: null,
          per_target: [
            {
              agent: `agent-${unsafe}`,
              kind: "failed",
              error: { code: `target-${unsafe}`, message: `target-message-${unsafe}` },
            },
          ],
        },
      },
    ],
    tapReexpandRows: [
      {
        name: `child-${unsafe}`,
        tap: `from-${unsafe}`,
        scope: "user",
        kind: "tap_error",
        error: { code: `child-code-${unsafe}`, message: `child-message-${unsafe}` },
      },
    ],
    tapRows: [
      {
        name: `tap-${unsafe}`,
        url: "",
        kind: "failed",
        error: { code: `tap-code-${unsafe}`, message: `tap-message-${unsafe}` },
      },
    ],
    selectors: [{ raw: "named", kind: "tap", name: `tap-${unsafe}` }],
  };
  const before = JSON.stringify(input);
  const lines = renderQuietUpdateErrors(input);
  expect(lines).toHaveLength(4);
  for (const line of lines) {
    expect(line).toContain("https://***@host/repo?token=***");
    for (const secret of ["alice", "password-secret", "query-secret", "\n", "\u0085"])
      expect(line).not.toContain(secret);
  }
  expect(JSON.stringify(input)).toBe(before);
});

test("C-UPD-42 explicit tap-error details preserve an unreachable code and empty message", () => {
  expect(
    renderQuietUpdateErrors({
      rows: [],
      tapRows: [],
      selectors: [],
      tapReexpandRows: [
        {
          name: "unknown",
          scope: "user",
          tap: "fixture",
          kind: "tap_error",
          error: { code: "unreachable", message: "" },
        },
      ],
    }),
  ).toEqual(["unknown (from fixture): failed (unreachable): "]);
});

test("C-UPD-42 all-skipped and successful rows contribute no diagnostics", () => {
  expect(
    renderQuietUpdateErrors({
      rows: [
        {
          name: "skipped",
          scope: "user",
          outcome: {
            kind: "updated",
            new_sha: null,
            per_target: [{ agent: "codex", kind: "skipped", reason: "untracked_directory" }],
          },
        },
        {
          name: "complete",
          scope: "user",
          outcome: {
            kind: "updated",
            new_sha: null,
            per_target: [{ agent: "codex", kind: "installed" }],
          },
        },
      ],
      tapRows: [],
      selectors: [],
      tapReexpandRows: [],
    }),
  ).toEqual([]);
});
