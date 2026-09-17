/**
 * parseRef for path and tap references (§8.1, §8.3) and the looksLikeSha
 * helper.
 */
import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { CrewError } from "../../../src/core/errors.ts";
import { looksLikeSha, parseRef } from "../../../src/refs/parse.ts";

describe("parseRef: path", () => {
  test("C-REF-01 ./skill-dir is a path source", () => {
    const r = parseRef("./my-skill", "/tmp/work");
    expect(r).toEqual({ type: "path", path: "/tmp/work/my-skill" });
  });
  test("C-REF-02 /abs/path is a path source", () => {
    const r = parseRef("/abs/foo");
    expect(r).toEqual({ type: "path", path: "/abs/foo" });
  });
  test("C-REF-03 ~/x expands to home", () => {
    const r = parseRef("~/x");
    expect(r).toEqual({ type: "path", path: `${homedir()}/x` });
  });
  test("../sibling is a path source", () => {
    const r = parseRef("../sibling", "/tmp/work");
    expect(r.type).toBe("path");
    if (r.type === "path") {
      expect(r.path).toBe("/tmp/sibling");
    }
  });
  test("bare ~", () => {
    const r = parseRef("~", "/tmp");
    expect(r).toEqual({ type: "path", path: homedir() });
  });
});

describe("parseRef: tap", () => {
  test("C-REF-14 bare name", () => {
    const r = parseRef("python-testing");
    expect(r).toEqual({
      type: "tap",
      tap: null,
      namespace: null,
      name: "python-testing",
      ref: null,
    });
  });
  test("C-REF-15 qualified", () => {
    const r = parseRef("core/python-testing");
    expect(r).toEqual({
      type: "tap",
      tap: "core",
      namespace: null,
      name: "python-testing",
      ref: null,
    });
  });
  test("C-REF-16 qualified pinned", () => {
    const r = parseRef("core/python-testing@v1.0");
    expect(r).toEqual({
      type: "tap",
      tap: "core",
      namespace: null,
      name: "python-testing",
      ref: "v1.0",
    });
  });
  test("bare name with @ref", () => {
    const r = parseRef("foo@bar");
    expect(r).toEqual({ type: "tap", tap: null, namespace: null, name: "foo", ref: "bar" });
  });
  test("bare name may start with a digit", () => {
    expect(parseRef("3-statement-model")).toEqual({
      type: "tap",
      tap: null,
      namespace: null,
      name: "3-statement-model",
      ref: null,
    });
  });
  test("C-REF-21 bare tap ref is canonicalized to lowercase", () => {
    expect(parseRef("BadName")).toEqual({
      type: "tap",
      tap: null,
      namespace: null,
      name: "badname",
      ref: null,
    });
  });
  test("C-REF-21 3-segment tap ref is canonicalized to lowercase", () => {
    expect(parseRef("Core/Tools/BadName@v1.0")).toEqual({
      type: "tap",
      tap: "core",
      namespace: "tools",
      name: "badname",
      ref: "v1.0",
    });
  });
  test("3-segment tap/namespace/skill parses unambiguously", () => {
    const r = parseRef("acme/marketing/copy-review");
    expect(r).toEqual({
      type: "tap",
      tap: "acme",
      namespace: "marketing",
      name: "copy-review",
      ref: null,
    });
  });
  test("3-segment with @ref", () => {
    const r = parseRef("acme/marketing/copy-review@v1.2");
    expect(r).toEqual({
      type: "tap",
      tap: "acme",
      namespace: "marketing",
      name: "copy-review",
      ref: "v1.2",
    });
  });
  test("4-segment fails", () => {
    expect(() => parseRef("a/b/c/d")).toThrow(/too many/);
  });
  test("3-segment with an invalid part fails", () => {
    expect(() => parseRef("tap/bad_name/skill")).toThrow();
  });
  test("C-REF-17 empty string fails", () => {
    expect(() => parseRef("")).toThrow(CrewError);
  });
  test("whitespace-only fails", () => {
    expect(() => parseRef("   ")).toThrow(CrewError);
  });
  test("tap with whitespace in ref fails", () => {
    expect(() => parseRef("foo@with space")).toThrow(CrewError);
  });
});

describe("looksLikeSha", () => {
  test("full SHA", () => {
    expect(looksLikeSha("a".repeat(40))).toBe(true);
  });
  test("short SHA", () => {
    expect(looksLikeSha("abc1234")).toBe(true);
  });
  test("too short", () => {
    expect(looksLikeSha("abc")).toBe(false);
  });
  test("non-hex", () => {
    expect(looksLikeSha("zzzzzzz")).toBe(false);
  });
});
