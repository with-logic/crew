/**
 * Safe rendering of user-controlled values in `--verbose` output
 * (§5.2, C-CLI-06b): credentials redacted, control characters escaped.
 */

import { describe, expect, test } from "bun:test";
import { safeArgs, safePath, safeUrl, sanitizeLine } from "../../src/util/redact.ts";

describe("C-CLI-06b redactUrl", () => {
  test("replaces a password, keeping the username visible", () => {
    expect(safeUrl("https://oauth2:ghp_SECRET@github.com/acme/skills.git")).toBe(
      "https://oauth2:***@github.com/acme/skills.git",
    );
  });

  test("replaces a lone https userinfo token", () => {
    expect(safeUrl("https://ghp_TOKENONLY@github.com/acme/skills.git")).toBe(
      "https://***@github.com/acme/skills.git",
    );
  });

  test("preserves an ssh username, which is not a secret", () => {
    expect(safeUrl("ssh://git@host/owner/repo.git")).toBe("ssh://git@host/owner/repo.git");
  });

  test("leaves scp-style remotes alone", () => {
    expect(safeUrl("git@github.com:acme/skills.git")).toBe("git@github.com:acme/skills.git");
  });

  test("redacts sensitive query parameters but keeps the rest", () => {
    expect(safeUrl("https://github.com/acme/skills.git?access_token=S2&ref=main")).toBe(
      "https://github.com/acme/skills.git?access_token=***&ref=main",
    );
  });

  test("leaves a credential-free url untouched", () => {
    expect(safeUrl("https://github.com/acme/skills.git")).toBe(
      "https://github.com/acme/skills.git",
    );
    expect(safeUrl("file:///tmp/repo")).toBe("file:///tmp/repo");
  });

  test("passes through a non-url argument unchanged", () => {
    expect(safeUrl("--no-single-branch")).toBe("--no-single-branch");
  });

  test("passes through an unparseable scheme-bearing token unchanged", () => {
    expect(safeUrl("http://[not-a-url")).toBe("http://[not-a-url");
  });
});

describe("C-CLI-06b sanitizeLine", () => {
  test("escapes control characters so output cannot be forged", () => {
    expect(sanitizeLine("a\nb")).toBe("a\\x0ab");
    expect(sanitizeLine("[31mred")).toBe("\\x1b[31mred");
    expect(sanitizeLine("bell")).toBe("bell\\x07");
  });

  test("escapes C1 control characters", () => {
    expect(sanitizeLine(`x${String.fromCodePoint(0x85)}y`)).toBe("x\\x85y");
  });

  test("leaves ordinary text, including non-ascii, intact", () => {
    expect(sanitizeLine("skills/café → ~/.claude")).toBe("skills/café → ~/.claude");
  });
});

describe("C-CLI-06b argv and path rendering", () => {
  test("redacts a url inside an argv and escapes controls", () => {
    const rendered = safeArgs([
      "clone",
      "--no-single-branch",
      "https://oauth2:ghp_X@host/o/r.git",
      "/tmp/d\nforged",
    ]);
    expect(rendered).toBe(
      "clone --no-single-branch https://oauth2:***@host/o/r.git /tmp/d\\x0aforged",
    );
    expect(rendered).not.toContain("ghp_X");
  });

  test("escapes controls in a path", () => {
    expect(safePath("/tmp/a[2Kb")).toBe("/tmp/a\\x1b[2Kb");
  });
});
