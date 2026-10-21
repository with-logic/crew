/** Zero-separator HTTP authority ends only at /, ? or #, including literal backslashes (§13, C-CLI-06c). */

import { expect, test } from "bun:test";
import { displayDetails, displayText, displayUrl } from "../../../src/refs/display-url.ts";
import { redactText, redactUrl, safeArgs, safeUrl } from "../../../src/util/redact.ts";

test.each(["http", "https", "HtTpS"])(
  "C-CLI-06c %s zero-separator userinfo retains an ordinary backslash until @",
  (scheme) => {
    const raw = String.raw`${scheme}:authority-secret\more@host.invalid/repo`;
    expect(displayText(`operation: ${raw}`)).toBe("operation: ***");
    expect(redactText(`operation: ${raw}`)).toBe("operation: ***");
    expect(displayDetails({ ref: raw })).toEqual({ ref: "***" });
    expect(redactUrl(raw)).toBe("***");
    expect(safeUrl(raw)).toBe("***");
    expect(safeArgs(["clone", raw, "destination"])).toBe("clone *** destination");
    expect(displayUrl(raw)).toBe("***");
  },
);

test.each(["/", "?", "#"])(
  "C-CLI-06c %s still ends a zero-separator authority after a backslash",
  (boundary) => {
    const raw = String.raw`http:label\path${boundary}ref=user@host.invalid`;
    expect(displayText(raw)).toBe(raw);
    expect(redactText(raw)).toBe(raw);
  },
);
