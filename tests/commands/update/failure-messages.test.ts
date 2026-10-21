/** Ordinary failure diagnostics survive both human renderers safely (§10.1, C-UPD-41). */

import { expect, test } from "bun:test";
import { writeSuccess } from "../../../src/cli/output.ts";
import { renderOutdated } from "../../../src/commands/outdated/render.ts";
import { renderUpdate } from "../../../src/commands/update/render.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { makeStyler } from "../../../src/util/term.ts";
import { captureStreams } from "../../helpers/env.ts";

for (const [command, render] of [
  ["update", renderUpdate],
  ["outdated", renderOutdated],
] as const) {
  test(`C-UPD-41 ${command} keeps the primary reason and retained recovery path`, () => {
    // This is a formatter contract, not a reproduction of an export cleanup failure.
    const message =
      "cannot read source: EACCES; temporary export retained at /tmp/crew-export-123; remove it manually";
    const rows: UpdateRow[] = [
      {
        name: "demo",
        scope: "user",
        outcome: { kind: "failed", error: { code: "source_unreachable", message } },
      },
    ];
    const output = render({ rows, tapReexpandRows: [], tapRows: [] }, makeStyler(false)).join("\n");
    expect(output).toContain(`source unreachable: ${message}`);
    expect(output).toContain("failed");
  });

  test(`C-UPD-41 ${command} sanitizes the whole diagnostic and leaves JSON raw`, () => {
    const code = "usage_error\u001b";
    const message =
      "read https://alice:password-secret@host/repo?token=query-secret failed\n\u0085retained at /tmp/export?token=path-secret";
    const rows: UpdateRow[] = [
      { name: "demo", scope: "user", outcome: { kind: "failed", error: { code, message } } },
    ];
    const before = JSON.stringify(rows);
    const human = render({ rows, tapReexpandRows: [], tapRows: [] }, makeStyler(false));
    const output = human.join("\n");
    expect(output).toContain("usage error\\x1b:");
    expect(output).toContain("failed\\x0a\\x85retained at /tmp/export?token=***");
    expect(output).toContain("https://***@host/repo?token=***");
    for (const secret of ["alice", "password-secret", "query-secret", "path-secret"])
      expect(output).not.toContain(secret);
    for (const control of ["\u001b", "\u0085"]) expect(output).not.toContain(control);
    expect(JSON.stringify(rows)).toBe(before);
    const capture = captureStreams();
    writeSuccess({ exitCode: 1, human, json: { rows } }, true, false, capture.streams);
    expect(JSON.parse(capture.stdout()).rows[0].outcome.error).toEqual({ code, message });
    expect(capture.stderr()).toBe("");
  });
}
