/** Empty update collection summaries reflect the actual refresh outcome (PRD §10.1). */

import { expect, test } from "bun:test";
import { renderOutdated } from "../../../src/commands/outdated/render.ts";
import type { TapRefreshRow } from "../../../src/commands/tap/refresh.ts";
import { renderUpdate } from "../../../src/commands/update/render.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { makeStyler } from "../../../src/util/term.ts";

const rows: TapRefreshRow[] = [
  { name: "quiet", url: "", kind: "refreshed" },
  {
    name: "quiet",
    url: "",
    kind: "failed",
    error: { code: "source_unreachable", message: "gone" },
  },
  { name: "quiet", url: "", kind: "skipped", reason: "path tap" },
  { name: "quiet", url: "", kind: "pending" },
  { name: "other", url: "", kind: "refreshed" },
];

test.each(rows)("empty collection with $kind refresh reports success accurately", (row) => {
  const lines = renderUpdate(
    {
      rows: [],
      tapReexpandRows: [],
      tapRows: [row],
      collections: [{ kind: "tap", name: "quiet", count: 0 }],
    },
    makeStyler(false),
  );
  const summary = lines.find((line) => line.includes("No skills installed"));
  const suffix = row.kind === "refreshed" && row.name === "quiet" ? " — refreshed it anyway." : ".";
  expect(summary).toBe(`- No skills installed from tap quiet${suffix}`);
});

test("C-UPD-46 shared source-absence rows and totals do not assume upstream removal", () => {
  const row: UpdateRow = {
    name: "demo",
    scope: "project",
    project_root: "/tmp/crew-project",
    transitively_required_by: ["app"],
    outcome: { kind: "source_gone" },
  };
  const input = { rows: [row], tapReexpandRows: [], tapRows: [] };
  const style = makeStyler(false);
  for (const dryRun of [false, true]) {
    const output = renderUpdate({ ...input, dryRun }, style).join("\n");
    expect(output).toContain("source no longer available");
    expect(output).toContain("keeping your copy");
    expect(output).toContain("1 with unavailable sources");
    expect(output).toContain("(in /tmp/crew-project)");
    expect(output).toContain("(required by app)");
    expect(output).not.toContain("removed upstream");
  }
  const outdated = renderOutdated(input, style).join("\n");
  expect(outdated).toContain("source no longer available");
  expect(outdated).toContain("keeping your copy");
  expect(outdated).toContain("(required by app)");
  expect(outdated).not.toContain("removed upstream");
});
