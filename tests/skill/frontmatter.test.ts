import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { extractFrontmatter } from "../../src/skill/frontmatter.ts";
import { validateFrontmatter } from "../../src/skill/validate.ts";

describe("extractFrontmatter edge cases", () => {
  test("leading blank lines tolerated", () => {
    const fm = extractFrontmatter("\n\n---\nname: foo\ndescription: x\n---\nbody");
    expect((fm.data as { name: string }).name).toBe("foo");
  });

  test("missing --- start fails", () => {
    expect(() => extractFrontmatter("no frontmatter here")).toThrow(CrewError);
  });

  test("unterminated frontmatter fails", () => {
    expect(() => extractFrontmatter("---\nname: foo\ndesc: x\n")).toThrow(CrewError);
  });

  test("windows line endings", () => {
    const fm = extractFrontmatter("---\r\nname: foo\r\ndescription: x\r\n---\r\nbody\r\n");
    expect((fm.data as { name: string }).name).toBe("foo");
  });
});

describe("validateFrontmatter: non-object inputs", () => {
  test("array data fails", () => {
    expect(() => validateFrontmatter([])).toThrow();
  });

  test("null data fails", () => {
    expect(() => validateFrontmatter(null)).toThrow();
  });
});
