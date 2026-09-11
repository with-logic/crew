/**
 * parseRef for git references (§8.2): URL forms, `@ref` and `//subpath` tails,
 * and the shorthand hosts.
 */
import { describe, expect, test } from "bun:test";
import { CrewError } from "../../../src/core/errors.ts";
import { parseRef } from "../../../src/refs/parse.ts";

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

describe("parseRef: scheme-less hosts (§8.2)", () => {
  const cases: readonly [string, string, string | null, string][] = [
    ["github.com/acme/skills", "https://github.com/acme/skills", null, ""],
    ["www.github.com/acme/skills", "https://github.com/acme/skills", null, ""],
    ["gitlab.com/acme/skills", "https://gitlab.com/acme/skills", null, ""],
    ["git.example.com:8443/acme/skills", "https://git.example.com:8443/acme/skills", null, ""],
    ["github.com/acme/skills@v1.2.0", "https://github.com/acme/skills", "v1.2.0", ""],
    [
      "github.com/acme/skills//python/testing",
      "https://github.com/acme/skills",
      null,
      "python/testing",
    ],
    [
      "github.com/acme/skills/tree/main/python/testing",
      "https://github.com/acme/skills.git",
      "main",
      "python/testing",
    ],
  ];
  for (const [input, url, ref, subpath] of cases) {
    test(`C-REF-31 ${input} parses like its https:// form`, () => {
      expect(parseRef(input)).toEqual({ type: "git", url, ref, subpath });
    });
  }
  test("C-REF-32 core/python-testing is still a tap source", () => {
    expect(parseRef("core/python-testing").type).toBe("tap");
  });
  test("C-REF-32 a.b and a.b/c are not scheme-less hosts", () => {
    expect(() => parseRef("a.b")).toThrow(CrewError);
    expect(() => parseRef("a.b/c")).toThrow(CrewError);
    expect(() => parseRef(".com/a/b")).toThrow(CrewError);
    expect(() => parseRef("com./a/b")).toThrow(CrewError);
  });
});
