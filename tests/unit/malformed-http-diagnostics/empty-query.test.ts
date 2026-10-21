/** Combining diagnostic cut points preserves existing empty query-value masking (§13, C-CLI-06c). */

import { expect, test } from "bun:test";
import { displayText } from "../../../src/refs/display-url.ts";
import { redactText } from "../../../src/util/redact.ts";

test("C-CLI-06c an empty credential value still has an undisplayable query boundary", () => {
  expect(displayText("operation: /repo?token=")).toBe("operation: /repo?token=***");
  expect(redactText("operation: /repo?token=")).toBe("operation: /repo?token=***");
});
