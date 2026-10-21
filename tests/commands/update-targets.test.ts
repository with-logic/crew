/** Truthful human update rows and totals without changing outcomes (§10.1, C-UPD-39). */

import { expect, test } from "bun:test";
import { renderUpdate } from "../../src/commands/update/render.ts";
import type { Outcome, PerAgentUpdate } from "../../src/install/update/types.ts";
import { makeStyler } from "../../src/util/term.ts";

const installed: PerAgentUpdate = { agent: "claude-code", kind: "installed" };
const current: PerAgentUpdate = { agent: "claude-code", kind: "up_to_date" };
const skipped: PerAgentUpdate = { agent: "codex", kind: "skipped", reason: "customized" };
const failed: PerAgentUpdate = {
  agent: "gemini-cli",
  kind: "failed",
  error: { code: "EACCES", message: "permission denied" },
};

function render(outcomes: readonly Outcome[]): string[] {
  return renderUpdate(
    {
      rows: outcomes.map((outcome, index) => ({ name: `demo-${index}`, scope: "user", outcome })),
      tapRows: [],
      tapReexpandRows: [],
    },
    makeStyler(false),
  );
}

const cases: readonly {
  readonly label: string;
  readonly targets: PerAgentUpdate[];
  readonly status: string;
  readonly summary: string;
}[] = [
  {
    label: "all complete",
    targets: [installed, { ...current, agent: "codex" }],
    status: "updated",
    summary: "1 updated",
  },
  {
    label: "completed and skipped",
    targets: [current, skipped],
    status: "partially updated",
    summary: "1 partially updated",
  },
  {
    label: "completed, failed and skipped",
    targets: [installed, failed, skipped],
    status: "partially updated",
    summary: "1 partially updated · 1 failure",
  },
  { label: "all failed", targets: [failed], status: "failed", summary: "1 failure" },
  { label: "all skipped", targets: [skipped], status: "skipped", summary: "1 skipped" },
  {
    label: "failed and skipped with no completed target",
    targets: [failed, skipped],
    status: "failed",
    summary: "1 failure",
  },
];

for (const { label, targets, status, summary } of cases) {
  test(`C-UPD-39 ${label} has truthful human status and totals`, () => {
    const outcome: Outcome = { kind: "updated", new_sha: "1234567890", per_target: targets };
    const jsonBefore = JSON.stringify(outcome);
    const lines = render([outcome]);
    expect(lines[2]).toContain(status);
    expect(lines.at(-1)).toBe(summary);
    if (status === "failed" || status === "skipped") expect(lines[2]).not.toContain("12345678");
    expect(JSON.stringify(outcome)).toBe(jsonBefore);
  });
}

test("C-UPD-39 totals distinguish fully updated, partial, skipped and hard failures", () => {
  const lines = render([
    { kind: "updated", new_sha: null, per_target: [installed] },
    { kind: "updated", new_sha: null, per_target: [installed, failed] },
    { kind: "updated", new_sha: null, per_target: [skipped] },
    { kind: "updated", new_sha: null, per_target: [failed, { ...failed, agent: "codex" }] },
  ]);
  expect(lines.at(-1)).toBe("1 updated · 1 partially updated · 1 skipped · 2 failures");
});

test("C-UPD-39 newly displayed target diagnostics escape controls without mutating JSON", () => {
  const outcome: Outcome = {
    kind: "updated",
    new_sha: null,
    per_target: [
      {
        agent: "co\u001bdex",
        kind: "failed",
        error: { code: "E\u007f", message: "blocked\n\u0080\u009f" },
      },
    ],
  };
  const jsonBefore = JSON.stringify(outcome);
  const output = render([outcome]).join("\n");
  expect(output).toContain("co\\x1bdex: failed (E\\x7f): blocked\\x0a\\x80\\x9f");
  expect(output).not.toContain("blocked\n");
  for (const control of [0x1b, 0x7f, 0x80, 0x9f]) {
    expect(output).not.toContain(String.fromCodePoint(control));
  }
  expect(JSON.stringify(outcome)).toBe(jsonBefore);
});
