/** Ordinary primary messages escape surviving line breaks (§10.1, C-UPD-41). */

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
  test(`C-UPD-41 ${command} escapes credential-free multiline primary messages`, () => {
    const message = "cannot read source\nretained at /tmp/export";
    const rows: UpdateRow[] = [
      {
        name: "demo",
        scope: "user",
        outcome: { kind: "failed", error: { code: "source_unreachable", message } },
      },
    ];
    const human = render({ rows, tapReexpandRows: [], tapRows: [] }, makeStyler(false));
    const output = human.join("\n");
    expect(output).toContain("source unreachable: cannot read source\\x0aretained at /tmp/export");
    expect(output).not.toContain(message);
    const capture = captureStreams();
    writeSuccess({ exitCode: 1, human, json: { rows } }, true, false, capture.streams);
    expect(JSON.parse(capture.stdout()).rows[0].outcome.error.message).toBe(message);
    expect(capture.stderr()).toBe("");
  });
}
