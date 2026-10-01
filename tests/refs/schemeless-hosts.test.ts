/**
 * Scheme-less host references (§8.2, §8.5; C-REF-31, C-REF-32).
 *
 * An argument whose first segment carries a dot is treated as a host and
 * parsed as its `https://`-prefixed form. Split out of `parse.test.ts`,
 * which is already over the 200-line cap.
 */

import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { parseRef } from "../../src/refs/parse.ts";

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
