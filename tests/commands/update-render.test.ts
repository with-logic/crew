/** Empty update collection summaries reflect the actual refresh outcome (PRD §10.1). */

import { expect, test } from "bun:test";
import type { TapRefreshRow } from "../../src/commands/tap/refresh.ts";
import { renderUpdate } from "../../src/commands/update/render.ts";
import { makeStyler } from "../../src/util/term.ts";

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
