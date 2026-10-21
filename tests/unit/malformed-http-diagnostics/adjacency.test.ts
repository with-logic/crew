/** Raw and visible control boundaries cannot hide later complete HTTP openers (§13, C-CLI-06c). */

import { expect, test } from "bun:test";
import { CrewError } from "../../../src/core/errors.ts";
import { displayText } from "../../../src/refs/display-url.ts";
import { redactText } from "../../../src/util/redact.ts";
import { SECRET } from "./cases.ts";

test.each([">", "'", "\t", "\n", "\u0085", "\\x09", "\\x0a", "\\x85"])(
  "C-CLI-06c a complete malformed opener after %j stays independently visible to redaction",
  (boundary) => {
    const text = `operation: https://host.invalid/o/r${boundary}https:/${SECRET}@host.invalid/o/r`;
    for (const input of [text, new CrewError("invalid_ref", text).message]) {
      expect(displayText(input)).not.toContain(SECRET);
      expect(redactText(input)).not.toContain(SECRET);
    }
  },
);
