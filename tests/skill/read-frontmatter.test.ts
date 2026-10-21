/** Frontmatter-only reads reuse the parser across byte and delimiter boundaries (§9 step 4). */

import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractFrontmatter } from "../../src/skill/frontmatter.ts";
import { readFrontmatter } from "../../src/skill/read-frontmatter.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

const readBoundaryBytes = 4096;

test("closing delimiters crossing a read boundary preserve parsed metadata", () => {
  const file = join(makeTempDir(), "SKILL.md");
  for (const ending of ["\n", "\r", "\r\n"]) {
    for (const offset of [-3, -2, -1, 0]) {
      const start = readBoundaryBytes + offset;
      const prefix = `---${ending}name: candidate${ending}#`;
      const comment = "x".repeat(start - Buffer.byteLength(prefix + ending));
      const raw = `${prefix}${comment}${ending}--- \t${ending}body: [invalid YAML`;
      writeFileSync(file, raw);
      expect(readFrontmatter(file)).toEqual({ name: "candidate" });
    }
  }
});

test("UTF-8 sequences crossing a read boundary preserve exact YAML values", () => {
  const file = join(makeTempDir(), "SKILL.md");
  for (const offset of [-2, -1]) {
    const start = readBoundaryBytes + offset;
    const prefix = '---\nname: candidate\nnote: "';
    const note = `${"x".repeat(start - Buffer.byteLength(prefix))}☃é`;
    const raw = `${prefix}${note}"\n---`;
    writeFileSync(file, raw);
    expect(readFrontmatter(file)).toEqual({ name: "candidate", note });
  }
});

test("skipped invalid delimiter lines resume at CR/LF across UTF-8 and chunk boundaries", () => {
  const file = join(makeTempDir(), "SKILL.md");
  for (const ending of ["\n", "\r", "\r\n"]) {
    for (const offset of [-1, 0, 1]) {
      const prefix = `---${ending}name: candidate${ending}#`;
      const unicode = `${"x".repeat(readBoundaryBytes - Buffer.byteLength(prefix) - 1)}☃`;
      const padding = "x".repeat(
        3 * readBoundaryBytes + offset - Buffer.byteLength(prefix + unicode),
      );
      const raw = `${prefix}${unicode}${padding}${ending}note: déjà ☃${ending} \u2003---${ending}body`;
      writeFileSync(file, raw);
      expect(readFrontmatter(file)).toEqual(extractFrontmatter(raw).data);
    }
  }
});

test("decoding malformed UTF-8 matches a full UTF-8 read", () => {
  const file = join(makeTempDir(), "SKILL.md");
  const raw = Buffer.concat([
    Buffer.from("---\nname: candidate\nnote: "),
    Buffer.from([0xe2, 0x82]),
    Buffer.from("\n---\nbody"),
  ]);
  writeFileSync(file, raw);
  expect(readFrontmatter(file)).toEqual(extractFrontmatter(raw.toString("utf8")).data);
});

test("data reading imposes no name or description validation", () => {
  const file = join(makeTempDir(), "SKILL.md");
  for (const yaml of ["", "[]", "plain scalar", "name: Invalid_Name\ndescription: []"]) {
    const raw = `---\n${yaml}\n---\nbody`;
    writeFileSync(file, raw);
    expect(readFrontmatter(file)).toEqual(extractFrontmatter(raw).data);
  }
});
