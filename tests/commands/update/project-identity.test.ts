/** C-UPD-43 project labels survive grouping, cleanup warnings, and quiet diagnostics (§10.1.1). */

import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { renderOutdated } from "../../../src/commands/outdated/render.ts";
import { renderQuietUpdateErrors } from "../../../src/commands/update/diagnostics.ts";
import { renderUpdate } from "../../../src/commands/update/render.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/types.ts";
import { makeStyler } from "../../../src/util/term.ts";

for (const preview of [false, true]) {
  test(`C-UPD-43 ${preview ? "outdated" : "update"} groups by tap and location in encounter order`, () => {
    const kind = preview ? "would_add" : "added";
    const tapReexpandRows: TapReexpandRow[] = [
      { name: "alpha", scope: "user", tap: "team", kind },
      {
        name: "alpha",
        scope: "project",
        project_root: `${homedir()}/project-a`,
        tap: "team",
        kind,
      },
      { name: "alpha", scope: "project", project_root: "/tmp/project-b", tap: "team", kind },
      { name: "beta", scope: "project", project_root: `${homedir()}/project-a`, tap: "team", kind },
    ];
    const input = { rows: [], tapRows: [], tapReexpandRows };
    const before = JSON.stringify(input);
    const lines = (preview ? renderOutdated : renderUpdate)(input, makeStyler(false));
    const groups = lines.filter((line) => line.includes("new skill"));
    expect(groups).toEqual(
      preview
        ? [
            "[ok] 1 new skill available from team: alpha",
            "[ok] 2 new skills available from team (in ~/project-a): alpha, beta",
            "[ok] 1 new skill available from team (in /tmp/project-b): alpha",
          ]
        : [
            "[ok] 1 new skill from team: alpha",
            "[ok] 2 new skills from team (in ~/project-a): alpha, beta",
            "[ok] 1 new skill from team (in /tmp/project-b): alpha",
          ],
    );
    expect(JSON.stringify(input)).toBe(before);
  });
}

test("C-UPD-43 successful addition warnings retain project identity and user formatting", () => {
  const lines = renderUpdate(
    {
      rows: [],
      tapRows: [],
      tapReexpandRows: [
        { name: "alpha", scope: "user", tap: "team", kind: "added", warnings: ["retained copy"] },
        {
          name: "alpha",
          scope: "project",
          project_root: "/tmp/project",
          tap: "team",
          kind: "added",
          warnings: ["retained copy"],
        },
      ],
    },
    makeStyler(false),
  );
  expect(lines.filter((line) => line.startsWith("[warn]"))).toEqual([
    "[warn] alpha (from team): retained copy",
    "[warn] alpha (in /tmp/project) (from team): retained copy",
  ]);
});

test("C-UPD-43 new project labels escape controls in normal and quiet output", () => {
  const project_root = "/tmp/project\nline\r\x1b\x7f\x85";
  const tapReexpandRows: TapReexpandRow[] = [
    { name: "alpha", scope: "project", project_root, tap: "team", kind: "would_add" },
    {
      name: "broken",
      scope: "project",
      project_root,
      tap: "team",
      kind: "tap_error",
      error: { code: "invalid_skill", message: "missing description" },
    },
  ];
  const input = { rows: [], tapRows: [], tapReexpandRows };
  const before = JSON.stringify(input);
  const tag = "(in /tmp/project\\x0aline\\x0d\\x1b\\x7f\\x85)";
  const update = renderUpdate({ ...input, dryRun: true }, makeStyler(false));
  const outdated = renderOutdated(input, makeStyler(false));
  const quiet = renderQuietUpdateErrors({ ...input, selectors: [] });
  for (const lines of [update, outdated]) {
    expect(lines.find((line) => line.includes("new skill"))).toContain(tag);
    expect(lines.find((line) => line.includes("invalid_skill"))).toContain(tag);
  }
  expect(quiet).toEqual([`broken ${tag} (from team): failed (invalid_skill): missing description`]);
  expect(JSON.stringify(input)).toBe(before);
});
