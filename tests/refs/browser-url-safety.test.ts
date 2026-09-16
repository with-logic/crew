/**
 * Browser-URL safety and grammar guards (§8.2, C-REF-26, C-REF-28..30).
 *
 * Four hazards, each reproduced against the pre-fix parser:
 *   - a rejected URL publishing its embedded credentials;
 *   - normalization silently dropping userinfo an authenticated clone needs;
 *   - `?query` / `#fragment` text being read as `@ref` / `//subpath`;
 *   - a malformed URL escaping as a raw TypeError instead of `invalid_ref`.
 */

import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import type { GitSource } from "../../src/core/types.ts";
import { parseRef } from "../../src/refs/parse.ts";

const SECRET = "s3cr3tvalue";
const GH = "https://github.com/acme/skills.git";

function asGit(ref: string): GitSource {
  return parseRef(ref) as GitSource;
}

describe("credentials never reach an error message", () => {
  test("a rejected blob URL redacts userinfo in message and details", () => {
    const raw = `https://user:${SECRET}@github.com/acme/skills/blob/main/py/notes.txt`;
    try {
      parseRef(raw);
      throw new Error("expected parseRef to reject a non-SKILL.md blob link");
    } catch (err) {
      expect(err).toBeInstanceOf(CrewError);
      const crewErr = err as CrewError;
      expect(crewErr.code).toBe("invalid_ref");
      expect(crewErr.message).not.toContain(SECRET);
      expect(crewErr.message).toContain("***");
      expect(JSON.stringify(crewErr.details)).not.toContain(SECRET);
    }
  });

  test("a malformed URL redacts userinfo in its error", () => {
    try {
      parseRef(`https://user:${SECRET}@exa mple.com/a/b`);
      throw new Error("expected parseRef to reject a malformed URL");
    } catch (err) {
      expect(err).toBeInstanceOf(CrewError);
      expect((err as CrewError).message).not.toContain(SECRET);
    }
  });

  // The blob and malformed cases above take branches that were already
  // redacted. This one is well-formed enough for `new URL` yet fails the
  // repository-shape check (`/owner` with no repo), which is the path that
  // echoed the raw reference back.
  test.each([
    [`https://user:${SECRET}@github.com/onlyowner`],
    [`https://${SECRET}@github.com/onlyowner`],
    [`https://user:${SECRET}@github.com/`],
  ])("%s: a parseable but wrong-shaped authenticated URL is redacted", (raw) => {
    try {
      parseRef(raw);
      throw new Error("expected parseRef to reject a URL with no repository segment");
    } catch (err) {
      expect(err).toBeInstanceOf(CrewError);
      const crewErr = err as CrewError;
      expect(crewErr.code).toBe("invalid_ref");
      expect(crewErr.message).not.toContain(SECRET);
      expect(JSON.stringify(crewErr.details)).not.toContain(SECRET);
    }
  });
});

describe("userinfo survives for acquisition", () => {
  test("a browser URL keeps its credentials in the clone URL", () => {
    const parsed = asGit(`https://user:${SECRET}@github.com/acme/skills/tree/main/py`);
    expect(parsed.url).toBe(`https://user:${SECRET}@github.com/acme/skills.git`);
    expect(parsed.ref).toBe("main");
    expect(parsed.subpath).toBe("py");
  });

  test("a plain authenticated URL is unchanged", () => {
    const parsed = asGit(`https://user:${SECRET}@github.com/acme/skills.git`);
    expect(parsed.url).toBe(`https://user:${SECRET}@github.com/acme/skills.git`);
  });

  test("userinfo is not mistaken for an @ref delimiter", () => {
    const parsed = asGit(`https://user:${SECRET}@github.com/acme/skills`);
    expect(parsed.ref).toBeNull();
  });
});

describe("query and fragment are dropped before grammar parsing", () => {
  test.each([
    ["https://github.com/acme/skills/tree/main/py?x=@v9", "main", "py"],
    ["https://github.com/acme/skills/tree/main/py#//evil", "main", "py"],
    ["https://github.com/acme/skills/tree/main/py?a=1#b=@v9", "main", "py"],
    ["https://github.com/acme/skills?ref=@v9", null, ""],
  ])("%s keeps the browser-derived ref and subpath", (raw, ref, subpath) => {
    const parsed = asGit(raw);
    expect(parsed.ref).toBe(ref as string | null);
    expect(parsed.subpath).toBe(subpath);
  });

  test("a query string cannot inject a subpath", () => {
    expect(asGit("https://github.com/acme/skills?x=//etc/passwd").subpath).toBe("");
  });
});

describe("refs containing a slash", () => {
  test.each([
    ["https://github.com/acme/skills@feature/foo//python", GH.replace(".git", ""), "feature/foo"],
    ["gh:acme/skills@feature/foo//python", GH, "feature/foo"],
    ["@acme/skills@release/2.0//python", GH, "release/2.0"],
  ])("%s parses the slash ref and the subpath", (raw, url, ref) => {
    const parsed = asGit(raw);
    expect(parsed.url).toBe(url);
    expect(parsed.ref).toBe(ref);
    expect(parsed.subpath).toBe("python");
  });

  test("a slash ref works without a subpath", () => {
    expect(asGit("gh:acme/skills@feature/foo").ref).toBe("feature/foo");
  });

  // The `@owner/repo` shorthand is recognised by counting `owner/repo`
  // segments, so a slash INSIDE the ref is the case most at risk of being
  // miscounted as a third segment — and with no `//subpath` to terminate the
  // body, nothing else marks where the repo ends.
  test.each([
    ["@acme/skills@feature/foo", "feature/foo"],
    ["@acme/skills@release/2.0", "release/2.0"],
    ["@acme/skills@feature/foo/bar", "feature/foo/bar"],
  ])("%s: the @owner/repo shorthand keeps a slash ref without a subpath", (raw, ref) => {
    const parsed = asGit(raw);
    expect(parsed.url).toBe(GH);
    expect(parsed.ref).toBe(ref);
    expect(parsed.subpath).toBe("");
  });

  test("whitespace still disqualifies a ref, leaving the `@` in the URL", () => {
    // §8.4: a git-ref contains no whitespace. `bad ref` is therefore not a
    // ref, and the `@` is treated as part of the URL.
    expect(asGit("https://github.com/acme/skills@bad ref").ref).toBeNull();
  });

  test("a colon still disqualifies a ref, so ssh-style URLs stay intact", () => {
    // A `:` after the final `@` means we are still inside an ssh-style
    // `host:path`, not looking at a ref.
    expect(asGit("git@github.com:acme/skills.git@v1:2").ref).toBeNull();
  });
});

describe("malformed URLs use the stable error name", () => {
  test.each(["https://:::/acme/skills", "https://exa mple.com/a/b"])(
    "%s is invalid_ref, not a raw TypeError",
    (raw) => {
      try {
        parseRef(raw);
        throw new Error("expected parseRef to reject a malformed URL");
      } catch (err) {
        expect(err).toBeInstanceOf(CrewError);
        expect((err as CrewError).code).toBe("invalid_ref");
      }
    },
  );
});

describe("blob links with no path", () => {
  test("report a missing folder rather than claiming a file", () => {
    try {
      parseRef("https://github.com/acme/skills/blob/main");
      throw new Error("expected parseRef to reject a pathless blob link");
    } catch (err) {
      expect(err).toBeInstanceOf(CrewError);
      const message = (err as CrewError).message;
      expect(message).toContain("no file or folder");
      expect(message).not.toContain("points at a file");
    }
  });
});
