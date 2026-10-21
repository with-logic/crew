/** Diagnostic URL authorities ending at end-of-input preserve masking policies (§5.2, §13, C-REF-28). */

import { expect, test } from "bun:test";
import { displayText } from "../../src/refs/display-url.ts";
import { redactText } from "../../src/util/redact.ts";

test("C-REF-28 credential authority at end-of-input keeps diagnostic and progress masking", () => {
  const text = "fatal: https://user:secret@host";
  expect(displayText(text)).toBe("fatal: https://***@host/");
  expect(redactText(text)).toBe("fatal: https://user:***@host/");
});

test("C-REF-28 credential-free authority at end-of-input remains visible", () => {
  const text = "fatal: https://host";
  expect(displayText(text)).toBe("fatal: https://host/");
  expect(redactText(text)).toBe("fatal: https://host/");
});
