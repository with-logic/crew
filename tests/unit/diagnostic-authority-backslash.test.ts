/** Existing literal-:// authority backslash handling suppresses ambiguous suffixes (§13, C-REF-28). */

import { expect, test } from "bun:test";
import { displayDetails, displayText } from "../../src/refs/display-url.ts";
import { redactText } from "../../src/util/redact.ts";

test("C-REF-28 literal-:// authority backslash keeps the operation prefix and suppresses the suffix", () => {
  const url = String.raw`https://user:AUTHORITY_SECRET\@host/repo`;
  const diagnostic = `fetch failed: ${url} PRIVATE_SUFFIX`;
  expect(displayText(diagnostic)).toBe("fetch failed: ***");
  expect(redactText(diagnostic)).toBe("fetch failed: ***");
  expect(displayDetails({ url: `${url} PRIVATE_SUFFIX`, count: 1 })).toEqual({
    url: "***",
    count: 1,
  });
});
