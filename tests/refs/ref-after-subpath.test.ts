/**
 * Ref-last git references (§8.2, C-REF-31/32): `url//subpath@ref` parses
 * the same as `url@ref//subpath`, across every git-shaped form, and a
 * ref spelled first suppresses the trailing scan.
 */

import { describe, expect, test } from "bun:test";
import { parseRef } from "../../src/refs/parse.ts";

const FORMS: readonly [label: string, refFirst: string, refLast: string][] = [
  [
    "https",
    "https://github.com/acme/skills.git@v1//skills/py",
    "https://github.com/acme/skills.git//skills/py@v1",
  ],
  [
    "ssh",
    "git@github.com:acme/skills.git@v1//skills/py",
    "git@github.com:acme/skills.git//skills/py@v1",
  ],
  ["gh:", "gh:acme/skills@v1//skills/py", "gh:acme/skills//skills/py@v1"],
  ["gl:", "gl:acme/skills@v1//skills/py", "gl:acme/skills//skills/py@v1"],
  ["bb:", "bb:acme/skills@v1//skills/py", "bb:acme/skills//skills/py@v1"],
  ["@owner/repo", "@acme/skills@v1//skills/py", "@acme/skills//skills/py@v1"],
  ["file://", "file:///tmp/repo@v1//skills/py", "file:///tmp/repo//skills/py@v1"],
  [
    "browser tree URL",
    "https://github.com/acme/skills/tree/main/skills/py",
    "https://github.com/acme/skills/tree/x/skills/py//skills/py@main",
  ],
];

describe("parseRef: @ref after //subpath", () => {
  test.each(FORMS)("C-REF-31 %s: ref-last equals ref-first", (_label, refFirst, refLast) => {
    const expected = parseRef(refFirst);
    expect(expected.type).toBe("git");
    expect(parseRef(refLast)).toEqual(expected);
  });

  test("C-REF-31 ref-last with a single-segment subpath", () => {
    expect(parseRef("gh:acme/skills//py@a1b2c3d")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: "a1b2c3d",
      subpath: "py",
    });
  });

  test("C-REF-31 an @ in an earlier subpath segment is not a ref", () => {
    expect(parseRef("gh:acme/skills//scoped@pkg/py")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: null,
      subpath: "scoped@pkg/py",
    });
  });

  test("C-REF-31 a trailing @ with nothing after it is left in the subpath", () => {
    expect(parseRef("gh:acme/skills//py@")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: null,
      subpath: "py@",
    });
  });

  test("C-REF-31 a ref containing whitespace is not a ref", () => {
    expect(parseRef("gh:acme/skills//py@v 1")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: null,
      subpath: "py@v 1",
    });
  });

  test("C-REF-31 a ref containing a colon is not a ref", () => {
    // §8.4 excludes `:` from `git-ref`. Reading it as one would produce a ref
    // git cannot resolve and surface as `ref_not_found`, when the text is
    // perfectly legal subpath content — so the tail stays in the subpath.
    expect(parseRef("gh:acme/skills//skill@release:bad")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: null,
      subpath: "skill@release:bad",
    });
  });

  test("C-REF-31 both ref positions reject a colon identically", () => {
    // The ref-first form already rejected `:`; ref-last must agree, or the
    // same reference means different things depending on where it is spelled.
    expect(parseRef("gh:acme/skills@release:bad//skill")).toMatchObject({
      type: "git",
      ref: null,
    });
    expect(parseRef("gh:acme/skills//skill@release:bad")).toMatchObject({
      type: "git",
      ref: null,
    });
  });

  test("C-REF-32 a ref spelled first preserves a literal @ in the final segment", () => {
    // The documented escape hatch: ref-first suppresses the trailing scan,
    // so `foo@bar` stays a directory name. This is also the behavior on the
    // parent branch, which the ref-last feature must not regress.
    expect(parseRef("gh:acme/skills@main//skills/foo@bar")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: "main",
      subpath: "skills/foo@bar",
    });
  });

  test("C-REF-32 without a leading ref the same tail is read as a ref", () => {
    expect(parseRef("gh:acme/skills//skills/foo@bar")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: "bar",
      subpath: "skills/foo",
    });
  });

  test("C-REF-32 ref-first wins over a trailing tail rather than conflicting", () => {
    expect(parseRef("gh:acme/skills@v1//py@v2")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: "v1",
      subpath: "py@v2",
    });
  });

  test("C-REF-33 a slash-containing ref is ref-first only; ref-last keeps it as subpath", () => {
    // The two positions are NOT interchangeable for a slash-containing
    // ref, and that asymmetry is deliberate: a subpath may contain `@`,
    // so `//a@b/c` cannot distinguish a ref from a directory named
    // `a@b`. Ref-first is the unambiguous spelling.
    expect(parseRef("gh:acme/skills@feature/foo//skills")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: "feature/foo",
      subpath: "skills",
    });
    // Ref-last with a slash is a legal SUBPATH, not a ref and not an
    // error — refusing it would reject a directory a user may have.
    expect(parseRef("gh:acme/skills//skills@feature/foo")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills.git",
      ref: null,
      subpath: "skills@feature/foo",
    });
  });
});
