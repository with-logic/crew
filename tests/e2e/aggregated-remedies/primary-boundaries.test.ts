/** Real permission hints survive fail-closed primary redaction (§10.1, §13, §16.6; C-UPD-47, C-TAP-08h). */

import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { renderOutdated } from "../../../src/commands/outdated/render.ts";
import { renderQuietUpdateErrors } from "../../../src/commands/update/diagnostics.ts";
import { renderUpdate } from "../../../src/commands/update/render.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { CrewError } from "../../../src/core/errors.ts";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { loadSkill } from "../../../src/skill/load.ts";
import { makeStyler } from "../../../src/util/term.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { FILE_HINT } from "./helpers.ts";

test("C-UPD-47 real query-shaped source failure keeps its hint at ordinary render boundaries", () => {
  const root = makeTempDir("crew-primary-\n\x1b\x85-?token=PRIMARY_SECRET-");
  const source = makeSkill(root, "broken", skillFrontmatter({ name: "broken" }));
  const manifest = join(source, "SKILL.md");
  chmodSync(manifest, 0);
  try {
    let failure: unknown;
    try {
      loadSkill(source);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CrewError);
    const cause = failure as CrewError;
    expect(cause.code).toBe("source_unreachable");
    expect(cause.message).toContain("EACCES");
    expect(cause.message).toContain("?token=PRIMARY_SECRET-");
    expect(cause.remedy).toBe(FILE_HINT);
    const rows: UpdateRow[] = [
      {
        name: "broken",
        scope: "user",
        outcome: {
          kind: "failed",
          error: { code: cause.code, message: cause.message, remedy: cause.remedy! },
        },
      },
    ];
    const input = { rows, tapReexpandRows: [], tapRows: [] };
    const before = JSON.stringify(input);
    // A real source error drives existing renderer boundaries; this is not a CLI update run.
    const outputs = [
      renderUpdate(input, makeStyler(false)),
      renderOutdated(input, makeStyler(false)),
      renderQuietUpdateErrors({ ...input, selectors: [] }),
    ];
    for (const lines of outputs) {
      const text = lines.join("\n");
      expect(text).toContain(`; next step: ${FILE_HINT}`);
      expect(text.split(FILE_HINT)).toHaveLength(2);
      expect(text).not.toContain("PRIMARY_SECRET");
      for (const line of lines) {
        for (const control of ["\n", "\r", "\x1b", "\x85"]) expect(line).not.toContain(control);
      }
    }
    expect(JSON.stringify(input)).toBe(before);
    expect(cause.remedy).toBe(FILE_HINT);
  } finally {
    chmodSync(manifest, 0o600);
  }
});

test("C-TAP-08h real query-shaped configured source keeps one warning hint in human and JSON", () => {
  const home = makeCrewHome();
  const root = makeTempDir("crew-primary-\n\x1b\x85-?token=PRIMARY_SECRET-");
  const source = makeSkill(root, "broken", skillFrontmatter({ name: "broken" }));
  const healthy = makeTempDir();
  makeSkill(healthy, "healthy", skillFrontmatter({ name: "healthy" }));
  writeConfig(
    {
      ...readConfig(home),
      taps: [
        { name: "broken", kind: "path", registered: true, path: root, url: "", subpath: "" },
        { name: "healthy", kind: "path", registered: true, path: healthy, url: "", subpath: "" },
      ],
    },
    home,
  );
  const before = readConfig(home);
  const manifest = join(source, "SKILL.md");
  chmodSync(manifest, 0);
  try {
    let failure: unknown;
    try {
      loadSkill(source);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(CrewError);
    const cause = failure as CrewError;
    expect(cause.code).toBe("source_unreachable");
    expect(cause.message).toContain("EACCES");
    expect(cause.message).toContain("?token=PRIMARY_SECRET-");
    expect(cause.remedy).toBe(FILE_HINT);
    const json = captureStreams();
    expect(runCli(["search", "--json"], { home, streams: json.streams })).toBe(0);
    const payload = JSON.parse(json.stdout()) as {
      warnings: string[];
      hits: { name: string; tap: string }[];
    };
    expect(payload.warnings).toHaveLength(1);
    const warning = payload.warnings[0]!;
    expect(warning).toContain(`; next step: ${FILE_HINT}`);
    expect(warning.split(FILE_HINT)).toHaveLength(2);
    expect(warning).not.toContain("PRIMARY_SECRET");
    for (const control of ["\n", "\r", "\x1b", "\x85"]) expect(warning).not.toContain(control);
    expect(payload.hits).toEqual([expect.objectContaining({ name: "healthy", tap: "healthy" })]);
    const human = captureStreams();
    expect(runCli(["search"], { home, streams: human.streams })).toBe(0);
    expect(human.stderr()).toBe(`${warning}\n`);
    expect(human.stdout()).toContain("healthy");
    expect(json.stderr()).toBe("");
    expect(readConfig(home)).toEqual(before);
    expect(readConfig(home).taps[0]!.path).toBe(root);
  } finally {
    chmodSync(manifest, 0o600);
  }
});
