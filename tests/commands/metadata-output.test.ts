/** Human metadata escapes controls before layout and preserves styling (§5.1). */

import { expect, test } from "bun:test";
import { renderSkills } from "../../src/commands/info/render.ts";
import { formatSearchResults } from "../../src/commands/search/render.ts";
import { makeStyler } from "../../src/util/term.ts";

const raw = "safe\x1b[31m\x85\x07\x7f\nend";
const escaped = "safe\\x1b[31m\\x85\\x07\\x7f\\x0aend";

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
