/** Whole HTTP progress values fail closed without scanning valid URL path interiors (§5.2, C-CLI-06c). */

import { expect, test } from "bun:test";
import { displayUrl } from "../../../src/refs/display-url.ts";
import { redactUrl, safeArgs, safeUrl } from "../../../src/util/redact.ts";
import { CONTROL_UNITS, controlledUrls, MALFORMED_URLS, SECRET } from "./cases.ts";

test.each(MALFORMED_URLS)("C-CLI-06c progress masks the complete malformed %j value", (url) => {
  expect(redactUrl(url)).toBe("***");
  expect(safeUrl(url)).toBe("***");
  expect(safeArgs(["clone", url, "destination"])).toBe("clone *** destination");
  expect(displayUrl(url)).not.toContain(SECRET);
});

test.each(CONTROL_UNITS)("C-CLI-06c whole progress masks raw or escaped %j controls", (c) => {
  for (const url of controlledUrls(c)) {
    expect(safeUrl(url)).toBe("***");
    expect(displayUrl(url)).not.toContain(SECRET);
  }
});

test("C-CLI-06c valid structured URLs retain safe parameters, path bytes, and SSH distinctions", () => {
  const path =
    "https://host.invalid/o/https:/user@nested.invalid/repo?ref=main&version=1&service=git";
  expect(redactUrl(path)).toBe(path);
  expect(displayUrl(path)).toBe(path);
  expect(safeArgs(["clone", path])).toBe(`clone ${path}`);
  expect(safeUrl("ssh://git@host.invalid/o/r")).toBe("ssh://git@host.invalid/o/r");
  expect(displayUrl("ssh://git@host.invalid/o/r")).toBe("ssh://***@host.invalid/o/r");
  expect(safeUrl("ssh://git:secret@host.invalid/o/r")).toBe("ssh://git:***@host.invalid/o/r");
  expect(safeUrl("git@host.invalid:o/r")).toBe("git@host.invalid:o/r");
  expect(safeUrl("HTTP: request denied")).toBe("HTTP: request denied");
  expect(safeUrl("https:///user:secret@host.invalid/o/r")).toBe(
    "https://user:***@host.invalid/o/r",
  );
});

test.each(["xhttps", "myhttps", "httpsx", "ssh", "custom"])(
  "C-CLI-06c %s is not a malformed HTTP scheme",
  (scheme) => {
    const value = `${scheme}:\\${SECRET}@host.invalid/o/r`;
    expect(redactUrl(value)).toBe(value);
  },
);
