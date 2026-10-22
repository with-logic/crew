/** C-UPD-47 empty-hint omission and safe explicit hints at existing projection/render boundaries (§13). */

import { expect, test } from "bun:test";
import { writeError, writeSuccess } from "../../../src/cli/output.ts";
import { renderOutdated } from "../../../src/commands/outdated/render.ts";
import { renderQuietUpdateErrors } from "../../../src/commands/update/diagnostics.ts";
import { renderUpdate } from "../../../src/commands/update/render.ts";
import { CrewError } from "../../../src/core/errors.ts";
import type { TapConfig } from "../../../src/core/types.ts";
import { currentTapChildren } from "../../../src/install/tap-children.ts";
import { collectAdditions } from "../../../src/install/tap-reexpand/additions.ts";
import { makeTapScanCache } from "../../../src/install/tap-reexpand/scan-cache.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/types.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { makeStyler } from "../../../src/util/term.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

/** The production caller already injects child installation; real discovery/validation stay intact. */
function projectFailure(error: CrewError): {
  readonly result: ReturnType<typeof collectAdditions>;
  readonly row: Extract<TapReexpandRow, { kind: "tap_error" }>;
} {
  const home = makeCrewHome();
  const root = makeTempDir();
  makeSkill(root, "child", skillFrontmatter({ name: "child" }));
  const tap: TapConfig = {
    name: "local",
    kind: "path",
    path: root,
    url: "",
    subpath: "",
    registered: true,
  };
  const result = collectAdditions({
    children: currentTapChildren(tap, home, root).children,
    conflictedNames: new Set(),
    memberNames: new Set(),
    scope: "user",
    tap,
    agents: [],
    resolvedSha: null,
    projectRoot: null,
    dryRun: false,
    ref: null,
    pinned: false,
    cache: makeTapScanCache(),
    namespaces: null,
    installedIndex: { byLocation: new Map() },
    installOne: () => {
      throw error;
    },
  });
  const row = result.rows[0]!;
  return { result, row: row as Extract<TapReexpandRow, { kind: "tap_error" }> };
}

for (const remedy of [undefined, null, ""]) {
  test(`C-UPD-47 ${String(remedy)} hints omit fields, added text and generic defaults`, () => {
    const error = new CrewError("source_unreachable", "primary message", {}, remedy);
    const { result, row } = projectFailure(error);
    expect(result.hardFailure).toBe(true);
    expect(result.added).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(row.kind).toBe("tap_error");
    expect(row.error).toEqual({ code: "source_unreachable", message: "primary message" });
    expect(Object.keys(row.error)).toEqual(["code", "message"]);
    const rows: UpdateRow[] = [
      { name: "ordinary", scope: "user", outcome: { kind: "failed", error: row.error } },
    ];
    const input = { rows, tapReexpandRows: [row], tapRows: [] };
    const before = JSON.stringify(input);
    for (const render of [renderUpdate, renderOutdated]) {
      const text = render(input, makeStyler(false)).join("\n");
      expect(text).toContain("source unreachable: primary message");
      expect(text).not.toContain("next step");
      expect(text).not.toContain("Next step");
      expect(text).not.toContain("your network");
    }
    expect(renderQuietUpdateErrors({ ...input, selectors: [] })).toEqual([
      "ordinary: failed (source_unreachable): primary message",
      "child (from local): failed (source_unreachable): primary message",
    ]);
    expect(JSON.stringify(input)).toBe(before);
    expect(error.remedy).toBe(remedy);
  });
}

test("C-UPD-47 explicit hints redact and escape in JSON and every existing human consumer", () => {
  const remedy =
    "Read local\nthen\x1b[31m\x85 check https://user:REMEDY_SECRET@host/help?token=QUERY_SECRET";
  const primary = new CrewError(
    "source_unreachable",
    "primary message",
    { path: "/local/source" },
    remedy,
  );
  const { result, row } = projectFailure(primary);
  expect(result.hardFailure).toBe(true);
  expect(result.added).toEqual([]);
  expect(result.rows).toHaveLength(1);
  expect(row.kind).toBe("tap_error");
  const error = row.error as typeof row.error & { remedy?: string };
  expect(Object.keys(error)).toEqual(["code", "message", "remedy"]);
  expect(error.remedy).toContain(
    "Read local\\x0athen\\x1b[31m\\x85 check https://***@host/help?token=***",
  );
  expect(error.code).toBe(primary.code);
  expect(error.message).toBe(primary.message);
  const project_root = "/tmp/remedy-project";
  const project = { ...row, scope: "project" as const, project_root };
  const rows: UpdateRow[] = [
    { name: "ordinary", scope: "user", outcome: { kind: "failed", error } },
  ];
  const input = { rows, tapReexpandRows: [project], tapRows: [] };
  const before = JSON.stringify(input);
  for (const render of [renderUpdate, renderOutdated]) {
    const text = render(input, makeStyler(false)).join("\n");
    expect(text).toContain("; next step: Read local\\x0athen\\x1b[31m\\x85");
    expect(text).toContain("  Next step: Read local\\x0athen\\x1b[31m\\x85");
    expect(text).toContain(`(in ${project_root})`);
    for (const secret of ["REMEDY_SECRET", "QUERY_SECRET", "\x1b", "\x85"])
      expect(text).not.toContain(secret);
  }
  const quiet = renderQuietUpdateErrors({ ...input, selectors: [] });
  expect(quiet).toHaveLength(2);
  for (const line of quiet)
    expect(line).toContain("; next step: Read local\\x0athen\\x1b[31m\\x85");
  expect(JSON.stringify(input)).toBe(before);
  const capture = captureStreams();
  writeSuccess({ exitCode: 1, json: input }, true, true, capture.streams);
  const json = JSON.parse(capture.stdout());
  expect(json.rows[0].outcome.error.remedy).toBe(error.remedy);
  expect(json.tapReexpandRows[0].project_root).toBe(project_root);
  for (const secret of ["REMEDY_SECRET", "QUERY_SECRET", "\x1b", "\x85"])
    expect(capture.stdout()).not.toContain(secret);
  expect(primary.remedy).toBe(remedy);
  const thrown = captureStreams();
  writeError(primary, true, thrown.streams, makeStyler(false));
  expect(JSON.parse(thrown.stdout()).error).toEqual({
    name: primary.code,
    message: primary.message,
    details: primary.details,
  });
  expect(thrown.stderr()).toBe("");
});
