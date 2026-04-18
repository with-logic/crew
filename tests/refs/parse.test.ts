import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { CrewError } from "../../src/core/errors.ts";
import { looksLikeSha, parseRef } from "../../src/refs/parse.ts";

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
    if (r.type === "path") expect(r.path).toBe("/tmp/sibling");
  });
  test("bare ~", () => {
    const r = parseRef("~", "/tmp");
    expect(r).toEqual({ type: "path", path: homedir() });
  });
});

describe("parseRef: git", () => {
  test("C-REF-04 https URL", () => {
    const r = parseRef("https://github.com/owner/repo");
    expect(r).toEqual({ type: "git", url: "https://github.com/owner/repo", ref: null, subpath: "" });
  });
  test("C-REF-05 https .git URL is accepted", () => {
    const r = parseRef("https://github.com/owner/repo.git");
    expect(r).toEqual({ type: "git", url: "https://github.com/owner/repo.git", ref: null, subpath: "" });
  });
  test("C-REF-06 git@host:owner/repo", () => {
    const r = parseRef("git@github.com:owner/repo.git");
    expect(r).toEqual({ type: "git", url: "git@github.com:owner/repo.git", ref: null, subpath: "" });
  });
  test("C-REF-07 gh:owner/repo", () => {
    const r = parseRef("gh:owner/repo");
    expect(r).toEqual({ type: "git", url: "https://github.com/owner/repo.git", ref: null, subpath: "" });
  });
  test("C-REF-08 gl:owner/repo", () => {
    const r = parseRef("gl:owner/repo");
    expect((r as { url: string }).url).toBe("https://gitlab.com/owner/repo.git");
  });
  test("C-REF-09 bb:owner/repo", () => {
    const r = parseRef("bb:owner/repo");
    expect((r as { url: string }).url).toBe("https://bitbucket.org/owner/repo.git");
  });
  test("C-REF-10 gh:owner/repo@v1.2.0", () => {
    const r = parseRef("gh:owner/repo@v1.2.0");
    expect(r).toEqual({ type: "git", url: "https://github.com/owner/repo.git", ref: "v1.2.0", subpath: "" });
  });
  test("C-REF-11 gh:owner/repo@a1b2c3d", () => {
    const r = parseRef("gh:owner/repo@a1b2c3d");
    expect((r as { ref: string }).ref).toBe("a1b2c3d");
  });
  test("C-REF-12 gh:owner/repo//skills/python", () => {
    const r = parseRef("gh:owner/repo//skills/python");
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/owner/repo.git",
      ref: null,
      subpath: "skills/python",
    });
  });
  test("C-REF-13 gh:owner/repo@main//skills/python", () => {
    const r = parseRef("gh:owner/repo@main//skills/python");
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/owner/repo.git",
      ref: "main",
      subpath: "skills/python",
    });
  });
  test("https URL with // is a git source", () => {
    const r = parseRef("https://example.com/owner/repo//sub");
    expect(r.type).toBe("git");
    if (r.type === "git") expect(r.subpath).toBe("sub");
  });
  test("invalid URL without path errors", () => {
    expect(() => parseRef("https://example.com")).toThrow();
  });
  test("bad shorthand errors", () => {
    expect(() => parseRef("gh:nobody")).toThrow();
  });
  test("invalid ssh URL errors", () => {
    expect(() => parseRef("git@ bad")).toThrow();
  });
});

describe("parseRef: tap", () => {
  test("C-REF-14 bare name", () => {
    const r = parseRef("python-testing");
    expect(r).toEqual({ type: "tap", tap: null, name: "python-testing", ref: null });
  });
  test("C-REF-15 qualified", () => {
    const r = parseRef("core/python-testing");
    expect(r).toEqual({ type: "tap", tap: "core", name: "python-testing", ref: null });
  });
  test("C-REF-16 qualified pinned", () => {
    const r = parseRef("core/python-testing@v1.0");
    expect(r).toEqual({ type: "tap", tap: "core", name: "python-testing", ref: "v1.0" });
  });
  test("bare name with @ref", () => {
    const r = parseRef("foo@bar");
    expect(r).toEqual({ type: "tap", tap: null, name: "foo", ref: "bar" });
  });
  test("invalid name fails", () => {
    expect(() => parseRef("BadName")).toThrow();
  });
  test("invalid qualified name fails", () => {
    expect(() => parseRef("tap/BadName")).toThrow();
  });
  test("too many slashes fail", () => {
    expect(() => parseRef("a/b/c")).toThrow();
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
