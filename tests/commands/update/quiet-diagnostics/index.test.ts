/** Quiet failure formatting preserves diagnostic content and raw payloads (§5.2, §10.1, C-UPD-42). */

import { expect, test } from "bun:test";
import { writeSuccess } from "../../../../src/cli/output.ts";
import { renderQuietUpdateErrors } from "../../../../src/commands/update/diagnostics.ts";
import type { UpdatePlan } from "../../../../src/commands/update/plan.ts";
import { captureStreams } from "../../../helpers/env.ts";

type DiagnosticInput = Pick<UpdatePlan, "rows" | "tapReexpandRows" | "tapRows" | "selectors">;

test("C-UPD-42 formatter preserves composite rollback and recovery messages, not a rollback reproduction", () => {
  const ordinary = "cannot read source; temporary export retained at /tmp/crew-export-123";
  const rollback =
    "codex: ENOTDIR; rollback `/tmp/newbie`: current target changed; prior copy retained at `/tmp/.crew-rollback-123/prior`; could not remove rollback directory `/tmp/.crew-rollback-456`";
  const input: DiagnosticInput = {
    rows: [
      {
        name: "broken",
        scope: "user",
        outcome: { kind: "failed", error: { code: "source_unreachable", message: ordinary } },
      },
      {
        name: "partial",
        scope: "user",
        outcome: {
          kind: "updated",
          new_sha: "new",
          per_target: [
            { agent: "claude-code", kind: "installed" },
            { agent: "gemini-cli", kind: "up_to_date" },
            { agent: "opencode", kind: "skipped", reason: "customized" },
            {
              agent: "codex",
              kind: "failed",
              error: { code: "EACCES", message: "permission denied" },
            },
          ],
        },
      },
      {
        name: "project",
        scope: "project",
        project_root: "/tmp/project",
        outcome: {
          kind: "failed",
          error: { code: "invalid_skill", message: "missing description" },
        },
      },
      { name: "healthy", scope: "user", outcome: { kind: "up_to_date" } },
    ],
    tapReexpandRows: [
      {
        name: "newbie",
        scope: "user",
        tap: "fixture",
        kind: "tap_error",
        error: { code: "usage_error", message: rollback },
      },
      {
        name: "soft",
        scope: "user",
        tap: "old",
        kind: "tap_error",
        error: { code: "no_skills_found", message: "source directory gone" },
      },
      {
        name: "added",
        scope: "user",
        tap: "fixture",
        kind: "added",
        warnings: ["cleanup warning"],
      },
    ],
    tapRows: [
      {
        name: "named",
        url: "",
        kind: "failed",
        error: { code: "source_unreachable", message: "fetch failed" },
      },
      {
        name: "unnamed",
        url: "",
        kind: "failed",
        error: { code: "source_unreachable", message: "soft warning" },
      },
      { name: "fresh", url: "", kind: "refreshed" },
    ],
    selectors: [
      { raw: "named", kind: "tap", name: "named" },
      { raw: "partial", kind: "skill", name: "partial" },
      { raw: "fixture/marketing", kind: "namespace", name: "fixture/marketing" },
    ],
  };
  const before = JSON.stringify(input);
  const stderr = renderQuietUpdateErrors(input);
  expect(stderr).toEqual([
    `broken: failed (source_unreachable): ${ordinary}`,
    "partial: codex: failed (EACCES): permission denied",
    "project (in /tmp/project): failed (invalid_skill): missing description",
    `newbie (from fixture): failed (usage_error): ${rollback}`,
    "soft (from old): failed (no_skills_found): source directory gone",
    "tap named: failed (source_unreachable): fetch failed",
  ]);
  expect(JSON.stringify(input)).toBe(before);
  const human = captureStreams();
  writeSuccess(
    { exitCode: 1, human: ["summary"], stderr, json: input },
    false,
    true,
    human.streams,
  );
  expect(human.stdout()).toBe("");
  expect(human.stderr()).toContain(rollback);
  const json = captureStreams();
  writeSuccess({ exitCode: 1, human: ["summary"], stderr, json: input }, true, true, json.streams);
  expect(json.stdout()).toBe(`${JSON.stringify(input, null, 2)}\n`);
  expect(json.stderr()).toBe("");
});
