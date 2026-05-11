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
    if (r.type === "path") {
      expect(r.path).toBe("/tmp/sibling");
    }
  });
  test("bare ~", () => {
    const r = parseRef("~", "/tmp");
    expect(r).toEqual({ type: "path", path: homedir() });
  });
});

describe("parseRef: git", () => {
  test("C-REF-04 https URL", () => {
    const r = parseRef("https://github.com/owner/repo");
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/owner/repo",
      ref: null,
      subpath: "",
    });
  });
  test("C-REF-05 https .git URL is accepted", () => {
    const r = parseRef("https://github.com/owner/repo.git");
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/owner/repo.git",
      ref: null,
      subpath: "",
    });
  });
  test("C-REF-06 git@host:owner/repo", () => {
    const r = parseRef("git@github.com:owner/repo.git");
    expect(r).toEqual({
      type: "git",
      url: "git@github.com:owner/repo.git",
      ref: null,
      subpath: "",
    });
  });
  test("C-REF-07 gh:owner/repo", () => {
    const r = parseRef("gh:owner/repo");
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/owner/repo.git",
      ref: null,
      subpath: "",
    });
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
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/owner/repo.git",
      ref: "v1.2.0",
      subpath: "",
    });
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
    if (r.type === "git") {
      expect(r.subpath).toBe("sub");
    }
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
  test("C-REF-18 @owner/repo expands to github https", () => {
    const r = parseRef("@with-logic/skills");
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/with-logic/skills.git",
      ref: null,
      subpath: "",
    });
  });
  test("C-REF-19 @owner/repo@v1.0 pins ref", () => {
    const r = parseRef("@with-logic/skills@v1.0.0");
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/with-logic/skills.git",
      ref: "v1.0.0",
      subpath: "",
    });
  });
  test("C-REF-20 @owner/repo//sub/path carries subpath", () => {
    const r = parseRef("@with-logic/skills//python/testing");
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/with-logic/skills.git",
      ref: null,
      subpath: "python/testing",
    });
  });
  test("@owner/repo@ref//sub combines all three", () => {
    const r = parseRef("@with-logic/skills@v1.0.0//python/testing");
    expect(r).toEqual({
      type: "git",
      url: "https://github.com/with-logic/skills.git",
      ref: "v1.0.0",
      subpath: "python/testing",
    });
  });
  test("@owner/repo accepts .git suffix", () => {
    const r = parseRef("@with-logic/skills.git");
    expect((r as { url: string }).url).toBe("https://github.com/with-logic/skills.git");
  });
  test("@name with no /repo falls to tap parsing and errors", () => {
    // `@name` is not a valid GitHub shorthand (no /repo) and not a
    // valid tap name (tap names don't start with @).
    expect(() => parseRef("@solo")).toThrow(CrewError);
  });
  test("@/repo with empty owner is invalid", () => {
    expect(() => parseRef("@/repo")).toThrow(CrewError);
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
