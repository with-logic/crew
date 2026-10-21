/** Shared delimiter recognition preserves metadata, normalized body and failures (§9 step 4). */

import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractFrontmatter } from "../../../src/skill/frontmatter.ts";
import { readFrontmatter } from "../../../src/skill/read-frontmatter.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

const missing = "SKILL.md is missing its YAML frontmatter — the first line should be `---`";
const unclosed = "SKILL.md frontmatter never closes — add a `---` line after the last YAML field";

for (const ending of ["\n", "\r", "\r\n"]) {
  test(`delimiter parity retains declared data and normalized body with ${JSON.stringify(ending)}`, () => {
    const file = join(makeTempDir(), "SKILL.md");
    for (const opening of ["---", " \t--- \u2003", "\ufeff---"]) {
      const raw = `\ufeff \u2003${ending}${opening}${ending}name: candidate${ending}note: déjà ☃${ending} \u00a0---\t${ending}body${ending}---${ending}`;
      writeFileSync(file, raw);
      const data = { name: "candidate", note: "déjà ☃" };
      expect(readFrontmatter(file)).toEqual(data);
      expect(extractFrontmatter(raw)).toEqual({ data, body: "body\n---\n" });
    }
  });
}

test("EOF closing delimiters, empty YAML and non-delimiter header lines retain their values", () => {
  const file = join(makeTempDir(), "SKILL.md");
  for (const [raw, data] of [
    ["---\n---", null],
    ["---\r\nname: candidate\r\n--- \u2003", { name: "candidate" }],
    ["---\n# ----\n# -- -\n# --- x\nname: candidate\n---", { name: "candidate" }],
  ] as const) {
    writeFileSync(file, raw);
    expect(readFrontmatter(file)).toEqual(data);
    expect(extractFrontmatter(raw)).toEqual({ data, body: "" });
  }
});

for (const [raw, message] of [
  ["", missing],
  [" \ufeff\r\n\u2003", missing],
  ["--\n---\n---", missing],
  ["--- x\n---", missing],
  ["- - -\n---", missing],
  ["----\n---", missing],
  ["x\n---\n---", missing],
  ["---", unclosed],
  ["---\r\n", unclosed],
  ["---\nname: candidate\n----\n-- -\n--- x", unclosed],
  [
    "---\nname: [\n---\nbody",
    "SKILL.md frontmatter isn't valid YAML — unexpected end of the stream within a flow collection (1:8)\\x0a\\x0a 1 | name: [\\x0a------------^",
  ],
] as const) {
  test(`delimiter errors retain exact messages for ${JSON.stringify(raw)}`, () => {
    const file = join(makeTempDir(), "SKILL.md");
    writeFileSync(file, raw);
    for (const parse of [() => readFrontmatter(file), () => extractFrontmatter(raw)]) {
      expect(parse).toThrow(message);
      try {
        parse();
      } catch (error) {
        expect(error).toHaveProperty("code", "invalid_skill");
        expect(error).toHaveProperty("message", message);
      }
    }
  });
}

test("complete valid headers remain unrestricted in size", () => {
  const file = join(makeTempDir(), "SKILL.md");
  const note = "x".repeat(2 * 1024 * 1024);
  const raw = `---\nname: candidate\nnote: ${note}\n---\nbody`;
  writeFileSync(file, raw);
  expect(readFrontmatter(file)).toEqual({ name: "candidate", note });
  expect(extractFrontmatter(raw)).toEqual({ data: { name: "candidate", note }, body: "body" });
});

test("malformed UTF-8 split before an ASCII chunk retains replacement characters", () => {
  const file = join(makeTempDir(), "SKILL.md");
  const prefix = "---\nnote: ";
  const note = "x".repeat(4095 - Buffer.byteLength(prefix));
  const raw = Buffer.concat([
    Buffer.from(prefix + note),
    Buffer.from([0xe2]),
    Buffer.from("\n---\nbody"),
  ]);
  writeFileSync(file, raw);
  const data = { note: `${note}�` };
  expect(readFrontmatter(file)).toEqual(data);
  expect(extractFrontmatter(raw.toString("utf8"))).toEqual({ data, body: "body" });
  writeFileSync(file, Buffer.concat([Buffer.from("---\nnote: "), Buffer.from([0xe2])]));
  expect(() => readFrontmatter(file)).toThrow(unclosed);
});
