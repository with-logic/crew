/** Query credentials remain opaque across control breaks and suffix punctuation (§5.2, C-UPD-41). */

import { expect, test } from "bun:test";
import { writeSuccess } from "../../../src/cli/output.ts";
import { renderOutdated } from "../../../src/commands/outdated/render.ts";
import { renderUpdate } from "../../../src/commands/update/render.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { makeStyler } from "../../../src/util/term.ts";
import { captureStreams } from "../../helpers/env.ts";

const credentials = [
  ["newline", "\nBOUNDARY_SECRET"],
  ["embedded newline", "prefix\nBOUNDARY_SECRET"],
  ["carriage return", "prefix\rBOUNDARY_SECRET"],
  ["tab", "prefix\tBOUNDARY_SECRET"],
  ["C1 break", "prefix\u0085BOUNDARY_SECRET"],
  ["comma", "BOUNDARY_SECRET,"],
  ["closing punctuation", "BOUNDARY_SECRET;:)]"],
] as const;

for (const [command, render] of [
  ["update", renderUpdate],
  ["outdated", renderOutdated],
] as const) {
  for (const remote of ["https://host/repo", "/repo"] as const) {
    test.each(credentials)(
      `C-UPD-41 ${command} masks %s in ${remote} query credentials and preserves raw JSON`,
      (_kind, credential) => {
        const message = `fatal: '${remote}?token=${credential}': unavailable`;
        const rows: UpdateRow[] = [
          {
            name: "demo",
            scope: "user",
            outcome: { kind: "failed", error: { code: "source_unreachable", message } },
          },
        ];
        const before = JSON.stringify(rows);
        const human = render({ rows, tapReexpandRows: [], tapRows: [] }, makeStyler(false));
        const output = human.join("\n");
        expect(output).toContain(`source unreachable: fatal: '${remote}?token=***`);
        expect(output).not.toContain("unavailable");
        expect(output).not.toContain("BOUNDARY_SECRET");
        expect(output).not.toContain("prefix");
        expect(output).not.toContain("token=***,");
        expect(output).not.toContain("token=***;:)]");
        expect(JSON.stringify(rows)).toBe(before);
        const capture = captureStreams();
        writeSuccess({ exitCode: 1, human, json: { rows } }, true, false, capture.streams);
        expect(JSON.parse(capture.stdout()).rows[0].outcome.error.message).toBe(message);
        expect(capture.stderr()).toBe("");
      },
    );
  }
}
