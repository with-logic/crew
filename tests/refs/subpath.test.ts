/**
 * Git subpath containment (§8.4, C-REF-22a / C-REF-22b).
 *
 * The grammar has always called a subpath "a POSIX relative path not
 * starting with `/`", but nothing enforced it, so a `..` component was
 * carried through parsing and joined to the tap's clone directory —
 * resolving outside the clone. These tests pin the guard at the parser,
 * which every entry point funnels through.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { parseRef } from "../../src/refs/parse.ts";

/** Parse and return the git subpath, or the thrown CrewError. */
function subpathOf(ref: string): string | CrewError {
  try {
    const source = parseRef(ref, "/tmp");
    return source.type === "git" ? source.subpath : "";
  } catch (err) {
    return err as CrewError;
  }
}

describe("git subpath containment", () => {
  test("C-REF-22a escaping subpaths are invalid_ref", () => {
    const escaping = [
      "file:///tmp/repo//../../../../etc",
      "gh:acme/skills//../secrets",
      "gh:acme/skills//nested/../../escape",
      "@acme/skills//..",
      "https://github.com/acme/skills.git//a/../../b",
    ];
    for (const ref of escaping) {
      const result = subpathOf(ref);
      expect(result).toBeInstanceOf(CrewError);
      expect((result as CrewError).code).toBe("invalid_ref");
      expect((result as CrewError).message).toContain("..");
    }
  });

  test("C-REF-22a absolute subpaths and backslashes are invalid_ref", () => {
    for (const ref of ["gh:acme/skills///abs/path", "gh:acme/skills//win\\style"]) {
      const result = subpathOf(ref);
      expect(result).toBeInstanceOf(CrewError);
      expect((result as CrewError).code).toBe("invalid_ref");
    }
  });

  test("C-REF-22a a rejected subpath never resolves outside the clone", () => {
    // The whole point of the guard: this join is what acquisition does.
    const clone = "/home/user/.crew/taps/repo";
    const result = subpathOf("gh:acme/skills//../../../../etc");
    expect(result).toBeInstanceOf(CrewError);
    // Had it parsed, the join would have escaped — assert the premise.
    expect(join(clone, "../../../../etc")).not.toStartWith(clone);
  });

  test("C-REF-22b legitimate subpaths survive, with . and // collapsed", () => {
    expect(subpathOf("gh:acme/skills//tools/demo")).toBe("tools/demo");
    expect(subpathOf("gh:acme/skills//./tools//demo")).toBe("tools/demo");
    expect(subpathOf("gh:acme/skills//skills")).toBe("skills");
    expect(subpathOf("gh:acme/skills")).toBe("");
    // A file named `..something` is not a traversal component.
    expect(subpathOf("gh:acme/skills//..hidden/x")).toBe("..hidden/x");
  });
});
