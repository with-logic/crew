/**
 * `fileOpensFrontmatter` (§9 step 5, "Gists"): how discovery tells a gist
 * skill file from any other `.md`, reading only as far as its first
 * non-blank line. Each case is checked on a real file against what
 * `opensFrontmatter` decides reading the whole text, so the two can't
 * drift apart.
 */

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileOpensFrontmatter, opensFrontmatter } from "../../src/skill/frontmatter.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

const CASES: readonly (readonly [string, string, boolean])[] = [
  ["frontmatter", "---\nname: x\n---\nbody\n", true],
  ["leading blank lines and CRLF", "\n \r\n\t\n---\r\nname: x\r\n---\r\n", true],
  ["a lone CR ending the line", "---\rname: x\r---\r", true],
  ["a byte-order mark", "﻿---\nname: x\n---\n", true],
  ["trailing spaces on the delimiter", "--- \t\nname: x\n---\n", true],
  ["the delimiter alone, unterminated", "---", true],
  ["prose", "notes\n---\n", false],
  ["prose, unterminated", "notes", false],
  ["a longer dash run", "----\n", false],
  ["an empty file", "", false],
  ["only blank lines", "\n\n  \n", false],
  ["blank lines past one read", `${"\n".repeat(10_000)}---\nname: x\n---\n`, true],
  ["delimiter spaces past one read", `---${" ".repeat(10_000)}\nname: x\n---\n`, true],
  ["delimiter then text past one read", `---${" ".repeat(10_000)}x\n`, false],
  // U+2003 is three bytes; the first read ends inside it, and only
  // decoding across reads sees it as the blank it is.
  ["a blank split across reads", `${" ".repeat(4094)} ---\nname: x\n---\n`, true],
];

describe("fileOpensFrontmatter", () => {
  const dir = makeTempDir("crew-opens-fm-");
  for (const [what, text, opens] of CASES) {
    test(`${what}: ${opens}`, () => {
      const path = join(dir, `${what.replace(/\W+/g, "-")}.md`);
      writeFileSync(path, text);
      expect(fileOpensFrontmatter(path)).toBe(opens);
      expect(opensFrontmatter(text)).toBe(opens);
    });
  }

  test("throws when the file can't be read", () => {
    expect(() => fileOpensFrontmatter(join(dir, "missing.md"))).toThrow();
  });
});
