/**
 * Browser-URL normalization (§8.2 "Browser URLs", C-REF-23..26).
 *
 * Every shape a user might paste out of GitHub / GitLab / Bitbucket,
 * driven through the public `parseRef` entry point so the whole
 * precedence chain is exercised, not just the helper.
 */

import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import type { GitSource } from "../../src/core/types.ts";
import { parseRef } from "../../src/refs/parse.ts";

const GH = "https://github.com/acme/skills.git";
const GL = "https://gitlab.com/acme/skills.git";
const BB = "https://bitbucket.org/acme/skills.git";

function git(url: string, ref: string | null, subpath: string): GitSource {
  return { type: "git", url, ref, subpath };
}

describe("parseRef: GitHub browser URLs", () => {
  test.each([
    ["https://github.com/acme/skills/tree/main/skills/python", git(GH, "main", "skills/python")],
    ["https://github.com/acme/skills/tree/v1.2.0", git(GH, "v1.2.0", "")],
    [
      "https://github.com/acme/skills/blob/main/skills/python/SKILL.md",
      git(GH, "main", "skills/python"),
    ],
    ["https://github.com/acme/skills/commit/a1b2c3d", git(GH, "a1b2c3d", "")],
    ["https://github.com/acme/skills/releases/tag/v1.2.0", git(GH, "v1.2.0", "")],
  ])("C-REF-23/24 %s", (input, expected) => {
    expect(parseRef(input)).toEqual(expected);
  });

  test("C-REF-24 blob link to a non-SKILL.md file is invalid_ref", () => {
    let caught: unknown;
    try {
      parseRef("https://github.com/acme/skills/blob/main/skills/python/README.md");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CrewError);
    expect((caught as CrewError).code).toBe("invalid_ref");
    expect((caught as CrewError).message).toContain("points at a file");
  });

  test("a blob link with no path after the ref is invalid_ref", () => {
    expect(() => parseRef("https://github.com/acme/skills/blob/main")).toThrow(CrewError);
  });

  test("pages we don't understand pass through as a plain URL", () => {
    expect(parseRef("https://github.com/acme/skills/issues/12")).toEqual(
      git("https://github.com/acme/skills/issues/12", null, ""),
    );
    expect(parseRef("https://github.com/acme/skills/tree")).toEqual(
      git("https://github.com/acme/skills/tree", null, ""),
    );
    expect(parseRef("https://github.com/acme/skills/releases/latest")).toEqual(
      git("https://github.com/acme/skills/releases/latest", null, ""),
    );
  });

  test("a repo-only URL is left exactly as typed (C-REF-04 still holds)", () => {
    expect(parseRef("https://github.com/acme/skills")).toEqual(
      git("https://github.com/acme/skills", null, ""),
    );
  });
});

describe("parseRef: GitLab and Bitbucket browser URLs", () => {
  test.each([
    ["https://gitlab.com/acme/skills/-/tree/main/python", git(GL, "main", "python")],
    ["https://gitlab.com/acme/skills/-/blob/main/python/SKILL.md", git(GL, "main", "python")],
    ["https://gitlab.com/acme/skills/-/commit/deadbeef", git(GL, "deadbeef", "")],
    ["https://gitlab.com/acme/skills/-/tags/v2.0.0", git(GL, "v2.0.0", "")],
    [
      "https://gitlab.com/acme/platform/skills/-/tree/main/python",
      git("https://gitlab.com/acme/platform/skills.git", "main", "python"),
    ],
    [
      "https://git.example.com/team/skills/-/tree/develop/python",
      git("https://git.example.com/team/skills.git", "develop", "python"),
    ],
    ["https://gitlab.com/acme/skills/-", git("https://gitlab.com/acme/skills/-", null, "")],
    ["https://bitbucket.org/acme/skills/src/main/python", git(BB, "main", "python")],
    ["https://bitbucket.org/acme/skills/src/main/python/SKILL.md", git(BB, "main", "python")],
    ["https://bitbucket.org/acme/skills/commits/deadbeef", git(BB, "deadbeef", "")],
  ])("C-REF-25 %s", (input, expected) => {
    expect(parseRef(input)).toEqual(expected);
  });
});

describe("parseRef: URL hygiene and explicit tails (C-REF-26)", () => {
  test.each([
    ["https://github.com/acme/skills/tree/main/python?tab=readme", git(GH, "main", "python")],
    ["https://github.com/acme/skills/tree/main/python#readme", git(GH, "main", "python")],
    ["https://github.com/acme/skills/tree/main/python/", git(GH, "main", "python")],
    ["https://www.github.com/acme/skills/tree/main/python", git(GH, "main", "python")],
    ["https://github.com/acme/skills/", git("https://github.com/acme/skills", null, "")],
    ["https://example.com/acme/skills/?x=1#y", git("https://example.com/acme/skills", null, "")],
    [
      "https://git.example.com:8443/acme/skills/-/tree/main",
      git("https://git.example.com:8443/acme/skills.git", "main", ""),
    ],
  ])("%s", (input, expected) => {
    expect(parseRef(input)).toEqual(expected);
  });

  test("an explicit @ref overrides the browser-derived ref", () => {
    expect(parseRef("https://github.com/acme/skills/tree/main/python@v9")).toEqual(
      git(GH, "v9", "python"),
    );
  });

  test("an explicit //subpath overrides the browser-derived subpath", () => {
    expect(parseRef("https://github.com/acme/skills/tree/main/python//other")).toEqual(
      git(GH, "main", "other"),
    );
  });

  test("non-http inputs are untouched by normalization", () => {
    expect(parseRef("git@github.com:acme/skills.git")).toEqual(
      git("git@github.com:acme/skills.git", null, ""),
    );
    expect(parseRef("file:///tmp/repo.git")).toEqual(git("file:///tmp/repo.git", null, ""));
  });

  test("a malformed http URL still reaches the existing invalid_ref path", () => {
    expect(() => parseRef("https://exa mple.com/a/b")).toThrow();
  });
});
