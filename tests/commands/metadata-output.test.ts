/** Human metadata escapes controls before layout and preserves styling (§5.1). */

import { expect, test } from "bun:test";
import { renderSkills } from "../../src/commands/info/render.ts";
import { formatSearchResults } from "../../src/commands/search/render.ts";
import { makeStyler } from "../../src/util/term.ts";
import { escapedMetadata as escaped, rawMetadata as raw } from "../helpers/metadata.ts";

test.each([false, true])(
  "search descriptions are safe before truncation (same name: %s)",
  (same) => {
    const lines = formatSearchResults({
      hits: [
        {
          tap: "local",
          name: "build",
          namespace: null,
          description: raw,
          installed: false,
          same_name_installed: same,
        },
      ],
      knownHits: [
        {
          tap: "trusted",
          name: "other",
          namespace: null,
          description: raw,
          url: "https://example.com/skills.git",
          subpath: "",
          trust: "curated",
        },
      ],
      query: "",
      tap: null,
      style: makeStyler(false),
      width: 120,
    });
    expect(lines.join("\n").split(escaped)).toHaveLength(3);
    for (const control of ["\x1b", "\x85", "\x07", "\x7f"]) {
      expect(lines.join("\n")).not.toContain(control);
    }
  },
);

test.each([false, true])("search escapes controls at the truncation boundary (%s)", (same) => {
  const note = same ? "same name installed elsewhere — " : "";
  const configuredPrefix = "x".repeat(47 - note.length);
  const knownPrefix = "x".repeat(47);
  const lines = formatSearchResults({
    hits: [
      {
        tap: "local",
        name: "build",
        namespace: null,
        description: `${configuredPrefix}\x1bend${"x".repeat(60)}`,
        installed: false,
        same_name_installed: same,
      },
    ],
    knownHits: [
      {
        tap: "trusted",
        name: "other",
        namespace: null,
        description: `${knownPrefix}\x1bend${"x".repeat(60)}`,
        url: "https://example.com/skills.git",
        subpath: "",
        trust: "curated",
      },
    ],
    query: "",
    tap: null,
    style: makeStyler(false),
    width: 60,
  });
  const configured = lines.find((line) => line.includes("build  "))!;
  const known = lines.find((line) => line.startsWith("    other  "))!;
  expect(configured).toHaveLength(60);
  expect(configured).toEndWith(`${note}${configuredPrefix}\\…`);
  expect(known).toBe(`    other  ${knownPrefix}\\… (crew install trusted/other)`);
  expect(known.replace(" (crew install trusted/other)", "")).toHaveLength(60);
  expect(lines.join("\n")).not.toContain("\x1b");
});

test("metadata escaping preserves Crew's own ANSI styling", () => {
  const output = renderSkills(
    [
      {
        name: "build",
        description: raw,
        license: raw,
        compatibility: raw,
        homepage: raw,
        dependencies: [raw],
      },
    ],
    { name: "local", kind: "path", registered: true, path: "/tmp/skills", url: "", subpath: "" },
    makeStyler(true),
    120,
  ).join("\n");
  expect(output).toContain("\x1b[1mbuild\x1b[0m");
  expect(output).toContain("\x1b[2mlicense\x1b[0m");
  expect(output.split(escaped)).toHaveLength(6);
  expect(output).not.toContain("\x1b[31m");
});
