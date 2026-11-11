/**
 * Project lockfile format (§9.3): what `.crewrc.lock` holds, how it is
 * written, and what is refused when it is read back.
 */
import { describe, expect, test } from "bun:test";
import type { CrewError } from "../../src/core/errors.ts";
import type { GitSource } from "../../src/core/types.ts";
import {
  isLockable,
  LOCK_HEADER,
  parseLock,
  pinnedRef,
  serializeLock,
} from "../../src/manifest/lock.ts";
import { parseManifest } from "../../src/manifest/parse.ts";
import { parseRef } from "../../src/refs/parse.ts";

const FILE = "/work/app/.crewrc.lock";
const A = "a".repeat(40);
const B = "b".repeat(40);

const parse = (text: string) => parseLock({ text, file: FILE });
const entryFor = (ref: string) =>
  parseManifest({ text: `${ref}\n`, file: "/work/app/.crewrc" })[0]!;

function rejection(text: string): CrewError {
  try {
    parse(text);
  } catch (err) {
    return err as CrewError;
  }
  throw new Error("expected parseLock to reject");
}

describe("serializeLock and parseLock", () => {
  test("an empty lock is just the header", () => {
    expect(serializeLock(new Map())).toBe(`${LOCK_HEADER}\n`);
    expect(parse(`${LOCK_HEADER}\n`)).toEqual(new Map());
  });

  test("entries are written one per line, sorted by reference, and read back unchanged", () => {
    const lock = new Map([
      ["gh:acme/tools@v1//skills/pdf", B],
      ["@acme/skills", A],
    ]);
    const text = serializeLock(lock);
    expect(text).toBe(`${LOCK_HEADER}\n${A} @acme/skills\n${B} gh:acme/tools@v1//skills/pdf\n`);
    expect(parse(text)).toEqual(lock);
  });

  test("a reference containing spaces survives the round trip", () => {
    const lock = new Map([["file:///work/my repos/skills", A]]);
    expect(parse(serializeLock(lock))).toEqual(lock);
  });

  test("comment and blank lines after the header are ignored", () => {
    expect(parse(`${LOCK_HEADER}\n\n# a note\n${A} @acme/skills\n`)).toEqual(
      new Map([["@acme/skills", A]]),
    );
  });
});

describe("parseLock: what is refused", () => {
  const cases: readonly (readonly [string, string, number, string])[] = [
    ["a file with no header", `${A} @acme/skills\n`, 1, "not a lockfile"],
    ["a header from another format version", "# crew lockfile v2\n", 1, "not a lockfile"],
    ["a short commit", `${LOCK_HEADER}\nabc123 @acme/skills\n`, 2, "40-character commit"],
    ["an uppercase commit", `${LOCK_HEADER}\n${"A".repeat(40)} @acme/skills\n`, 2, "40-character"],
    ["a line with no reference", `${LOCK_HEADER}\n${A}\n`, 2, "40-character commit"],
    ["a reference locked twice", `${LOCK_HEADER}\n${A} @x/y\n${B} @x/y\n`, 3, "a second time"],
  ];
  for (const [what, text, line, reason] of cases) {
    test(`${what} is manifest_invalid`, () => {
      const err = rejection(text);
      expect(err.code).toBe("manifest_invalid");
      expect(err.message).toContain(`${FILE} line ${line}`);
      expect(err.message).toContain(reason);
      expect(err.details).toEqual({ file: FILE, line });
    });
  }
});

describe("isLockable", () => {
  test("a git line with no ref, a branch, or a tag is lockable", () => {
    for (const ref of ["@acme/skills", "gh:acme/skills@main", "gh:acme/skills@v1.4.0//pdf"]) {
      expect(isLockable(entryFor(ref))).toBe(true);
    }
  });

  test("a git line pinned to a full commit, and a path line, are not", () => {
    expect(isLockable(entryFor(`gh:acme/skills@${A}`))).toBe(false);
    expect(isLockable(entryFor("./tools/skills/notes"))).toBe(false);
  });

  test("an abbreviated commit is still lockable: it is not a full commit", () => {
    expect(isLockable(entryFor("gh:acme/skills@a1b2c3d"))).toBe(true);
  });
});

describe("pinnedRef", () => {
  const forms = [
    "@acme/skills",
    "gh:acme/tools@v1.4.0//skills/pdf",
    "git@github.com:acme/skills.git//python/testing",
    "ssh://git@host/owner/repo.git@main",
    "file:///work/repos/skills",
  ];
  for (const ref of forms) {
    test(`pins ${ref} to a commit, keeping its repository and subpath`, () => {
      const entry = entryFor(ref);
      const pinned = parseRef(pinnedRef(entry, A));
      expect(pinned).toEqual({ ...(entry.source as GitSource), ref: A });
    });
  }

  test("a path line is returned as written", () => {
    expect(pinnedRef(entryFor("./tools/skills/notes"), A)).toBe("./tools/skills/notes");
  });
});
