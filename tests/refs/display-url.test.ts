/**
 * `displayUrl` — safe rendering of URLs that reach user-facing errors.
 *
 * Covers the three hazards: userinfo, credential-bearing query parameters,
 * and control characters that could forge terminal output.
 */

import { describe, expect, test } from "bun:test";
import { displayDetails, displayText, displayUrl } from "../../src/refs/display-url.ts";

const ESC = String.fromCharCode(27);

describe("displayUrl", () => {
  test("masks userinfo but keeps the rest of the URL readable", () => {
    expect(displayUrl("https://user:s3cr3t@github.com/acme/skills.git")).toBe(
      "https://***@github.com/acme/skills.git",
    );
  });

  test("masks a lone username with no password", () => {
    expect(displayUrl("https://ghp_tokenvalue@github.com/acme/skills")).toBe(
      "https://***@github.com/acme/skills",
    );
  });

  test("redacts sensitive query values and keeps innocuous ones", () => {
    const rendered = displayUrl("https://host/o/r?token=abc123&branch=main");
    expect(rendered).not.toContain("abc123");
    expect(rendered).toContain("token=***");
    expect(rendered).toContain("branch=main");
  });

  test("matches sensitive parameter names case-insensitively", () => {
    expect(displayUrl("https://host/o/r?Private_Token=xyz789")).not.toContain("xyz789");
  });

  test("neutralizes control characters in a URL", () => {
    const rendered = displayUrl(`https://host/o/r${ESC}[31mRED`);
    expect(rendered).not.toContain(ESC);
  });

  test("neutralizes control characters in a non-URL string", () => {
    const rendered = displayUrl(`not-a-url${ESC}[2K`);
    expect(rendered).not.toContain(ESC);
    expect(rendered).toContain("\\x1b");
  });

  test("leaves a credential-free URL untouched", () => {
    expect(displayUrl("https://github.com/acme/skills.git")).toBe(
      "https://github.com/acme/skills.git",
    );
  });

  test("masks userinfo even when the URL is too malformed to parse", () => {
    const rendered = displayUrl("https://user:s3cr3t@exa mple.com/a/b");
    expect(rendered).not.toContain("s3cr3t");
    expect(rendered).toContain("***@");
  });
});

describe("displayText", () => {
  test("redacts a URL embedded in prose, which a whole-string parse cannot see", () => {
    // Git's stderr shape: the remote is quoted inside a sentence.
    const stderr = "fatal: unable to access 'https://user:s3cr3t@host/o/r.git/': denied";
    const rendered = displayText(stderr);
    expect(rendered).not.toContain("s3cr3t");
    expect(rendered).toContain("***@host/o/r.git");
    // The prose around it survives.
    expect(rendered).toContain("fatal: unable to access");
    expect(rendered).toContain("denied");
  });

  test("redacts a credential query parameter inside prose", () => {
    const rendered = displayText("cloning https://host/o/r.git?token=s3cr3t now");
    expect(rendered).not.toContain("s3cr3t");
    expect(rendered).toContain("token=***");
  });

  test("keeps real line breaks but escapes other control characters", () => {
    // Git's stderr is genuinely multi-line; collapsing it would make the
    // diagnostic unreadable, while ESC must still be neutralised.
    const rendered = displayText(`line one\nline ${ESC}[2Ktwo`);
    expect(rendered).toContain("\n");
    expect(rendered).not.toContain(ESC);
    expect(rendered).toContain("\\x1b");
  });

  test("redacts a query tail git echoed without its scheme", () => {
    // Git strips `file://` and reports the bare path, so there is no scheme
    // to anchor a URL match on — but the query still carries the secret.
    const rendered = displayText("fatal: '/repo.git?token=s3cr3t' does not appear to be a repo");
    expect(rendered).not.toContain("s3cr3t");
    expect(rendered).toContain("token=***");
  });

  test("leaves a non-sensitive query parameter readable", () => {
    expect(displayText("fetched /repo.git?depth=1 ok")).toContain("depth=1");
  });

  test("leaves text with no URL untouched", () => {
    expect(displayText("nothing to redact here")).toBe("nothing to redact here");
  });
});

describe("displayDetails", () => {
  test("masks string values while preserving the §13 key contract", () => {
    const out = displayDetails({ url: "https://user:s3cr3t@host/o/r.git", count: 2 });
    expect(Object.keys(out).sort()).toEqual(["count", "url"]);
    expect(out["url"]).not.toContain("s3cr3t");
    // Non-string values pass through unchanged.
    expect(out["count"]).toBe(2);
  });
});
