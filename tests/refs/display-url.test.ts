/**
 * `displayUrl` — safe rendering of URLs that reach user-facing errors.
 *
 * Covers the three hazards: userinfo, credential-bearing query parameters,
 * and control characters that could forge terminal output.
 */

import { describe, expect, test } from "bun:test";
import { displayUrl } from "../../src/refs/display-url.ts";

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
