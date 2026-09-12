/**
 * Scheme-less host authority validation (§8.2 "Scheme-less hosts",
 * C-REF-32a).
 *
 * The scheme-less form synthesizes `https://<arg>`, so the first segment
 * has to be a bare `host[:port]`. Anything `new URL` could reinterpret —
 * userinfo above all — must be rejected before the prefix is applied, or
 * a GitHub-looking reference resolves to an unrelated host.
 */

import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { parseRef } from "../../src/refs/parse.ts";

describe("scheme-less authority (§8.2)", () => {
  // Each of these would, if `https://` were prepended blindly, parse with a
  // host other than the one a reader sees first.
  const spoofs: readonly string[] = [
    "github.com@evil.example/acme/skills",
    "github.com:443@evil.example/acme/skills",
    "user:pw@github.com/acme/skills",
  ];
  for (const input of spoofs) {
    test(`C-REF-32a ${input} is not a git source`, () => {
      let thrown: unknown;
      let parsed: unknown;
      try {
        parsed = parseRef(input);
      } catch (err) {
        thrown = err;
      }
      // The decisive property: no git source is produced, so nothing
      // downstream can clone the trailing host. (The message itself does
      // quote the user's input, trailing host and all, which is correct —
      // errors should echo what was typed.)
      expect(parsed).toBeUndefined();
      expect(thrown).toBeInstanceOf(CrewError);
      expect((thrown as CrewError).code).toBe("invalid_ref");
    });
  }

  const malformed: readonly string[] = [
    "github.com:abc/o/r",
    "github.com:/o/r",
    "github.com?x=1/o/r",
    "github.com#frag/o/r",
    "-bad.com/o/r",
    "bad-.com/o/r",
  ];
  for (const input of malformed) {
    test(`C-REF-32a ${input} is invalid_ref, not a native URL error`, () => {
      expect(() => parseRef(input)).toThrow(CrewError);
    });
  }

  test("C-REF-32a legitimate hosts and ports still parse", () => {
    expect(parseRef("github.com/acme/skills")).toEqual({
      type: "git",
      url: "https://github.com/acme/skills",
      ref: null,
      subpath: "",
    });
    expect(parseRef("git.example.com:8443/acme/skills")).toEqual({
      type: "git",
      url: "https://git.example.com:8443/acme/skills",
      ref: null,
      subpath: "",
    });
    expect(parseRef("my-host.example.co.uk/acme/skills")).toEqual({
      type: "git",
      url: "https://my-host.example.co.uk/acme/skills",
      ref: null,
      subpath: "",
    });
  });

  test("C-REF-32a an explicit URL is still a git source", () => {
    // The authority guard rejects userinfo in SCHEME-LESS refs, because
    // prepending `https://` would let `github.com@evil.example/o/r` clone
    // from the trailing host. An explicit URL is a different case: §8.5
    // matches it earlier, the user wrote the scheme themselves, and
    // credentials there are legitimate — §8.2 requires them to survive so
    // private repos still clone. This pins that the guard stops at the
    // scheme-less form and leaves authenticated URLs intact.
    expect(parseRef("https://user:pw@github.com/acme/skills")).toMatchObject({
      type: "git",
      url: "https://user:pw@github.com/acme/skills",
    });
  });
});
