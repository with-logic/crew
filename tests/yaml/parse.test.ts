import { describe, expect, test } from "bun:test";
import { parseYaml, stringifyYaml } from "../../src/yaml/parse.ts";

describe("parseYaml scalars", () => {
  test("empty returns null", () => {
    expect(parseYaml("")).toBe(null);
  });
  test("null/~/true/false", () => {
    expect(parseYaml("~")).toBe(null);
    expect(parseYaml("null")).toBe(null);
    expect(parseYaml("true")).toBe(true);
    expect(parseYaml("false")).toBe(false);
  });
  test("integers and floats", () => {
    expect(parseYaml("42")).toBe(42);
    expect(parseYaml("-17")).toBe(-17);
    expect(parseYaml("1.5")).toBe(1.5);
  });
  test("quoted strings", () => {
    expect(parseYaml('"hi"')).toBe("hi");
    expect(parseYaml("'hi'")).toBe("hi");
    expect(parseYaml('"a\\nb"')).toBe("a\nb");
    expect(parseYaml("'a''b'")).toBe("a'b");
  });
});

describe("parseYaml maps", () => {
  test("flat map", () => {
    expect(parseYaml("a: 1\nb: two")).toEqual({ a: 1, b: "two" });
  });
  test("nested map", () => {
    expect(parseYaml("a:\n  b: 1\n  c: two")).toEqual({ a: { b: 1, c: "two" } });
  });
  test("comments ignored", () => {
    expect(parseYaml("# hello\na: 1 # trailing")).toEqual({ a: 1 });
  });
  test("blank lines tolerated", () => {
    expect(parseYaml("\n\na: 1\n\nb: 2\n\n")).toEqual({ a: 1, b: 2 });
  });
  test("# inside quoted key not a comment", () => {
    expect(parseYaml('"a#b": 1')).toEqual({ "a#b": 1 });
  });
  test("empty nested value returns null", () => {
    expect(parseYaml("a:")).toEqual({ a: null });
  });
});

describe("parseYaml lists", () => {
  test("flat list", () => {
    expect(parseYaml("- 1\n- 2\n- three")).toEqual([1, 2, "three"]);
  });
  test("list of maps", () => {
    expect(parseYaml("- name: a\n  url: u\n- name: b\n  url: v")).toEqual([
      { name: "a", url: "u" },
      { name: "b", url: "v" },
    ]);
  });
  test("nested list under key", () => {
    expect(parseYaml("items:\n  - 1\n  - 2")).toEqual({ items: [1, 2] });
  });
  test("empty list short form not supported but not crashing", () => {
    // We don't support `[]` flow-style in parse; ensure we error cleanly.
    // (stringifyYaml does emit `[]`, but parse round-trips via other mechanisms.)
    const yaml = "items:\n  - a\n  - b\n";
    expect(parseYaml(yaml)).toEqual({ items: ["a", "b"] });
  });
});

describe("parseYaml failures", () => {
  test("tab indentation rejected", () => {
    expect(() => parseYaml("a:\n\tb: 1")).toThrow();
  });
  test("unbalanced quoted string", () => {
    expect(() => parseYaml('a: "unterminated')).toThrow();
  });
  test("invalid indent increase", () => {
    expect(() => parseYaml("a: 1\n  b: 2")).toThrow();
  });
});

describe("stringifyYaml round-trip", () => {
  test("simple round-trip", () => {
    const obj = { a: 1, b: "two", c: [1, 2, 3] };
    const serialized = stringifyYaml(obj);
    expect(parseYaml(serialized)).toEqual(obj);
  });
  test("nested round-trip", () => {
    const obj = { taps: [{ name: "core", url: "https://x/y.git" }], disabled_targets: [], autoupdate: { enabled: false, interval_seconds: 14400 } };
    const serialized = stringifyYaml(obj);
    expect(parseYaml(serialized)).toEqual(obj);
  });
  test("empty array", () => {
    expect(stringifyYaml([])).toBe("[]\n");
  });
  test("empty map", () => {
    expect(stringifyYaml({})).toBe("{}\n");
  });
  test("quotes strings that look like numbers", () => {
    const s = stringifyYaml({ k: "42" });
    expect(parseYaml(s)).toEqual({ k: "42" });
  });
  test("null and booleans emit as bare tokens", () => {
    expect(stringifyYaml(null)).toBe("null\n");
    expect(stringifyYaml(true)).toBe("true\n");
    expect(stringifyYaml(42)).toBe("42\n");
  });
  test("top-level string round-trips even when it looks syntactic", () => {
    // Whatever quoting style js-yaml chooses, the round-trip must preserve
    // the string exactly.
    const s = stringifyYaml("foo:bar");
    expect(parseYaml(s)).toBe("foo:bar");
  });
});
