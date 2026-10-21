/** Malformed HTTP authority suffixes conceal credentials through public display helpers (§13, C-CLI-06c). */

import { expect, test } from "bun:test";
import { CrewError } from "../../../src/core/errors.ts";
import { displayDetails, displayText } from "../../../src/refs/display-url.ts";
import { redactText } from "../../../src/util/redact.ts";
import { CONTROL_UNITS, controlledUrls, MALFORMED_URLS, SECRET, SUFFIX } from "./cases.ts";

test.each(MALFORMED_URLS)("C-CLI-06c malformed opener %j suppresses its whole suffix", (url) => {
  const text = `operation: ${url} ${SUFFIX}`;
  for (const input of [text, new CrewError("invalid_ref", text).message]) {
    expect(displayText(input)).toBe("operation: ***");
    expect(redactText(input)).toBe("operation: ***");
  }
  const identity = { untouched: true };
  expect(displayDetails({ ref: `${url} ${SUFFIX}`, count: 2, identity })).toEqual({
    ref: "***",
    count: 2,
    identity,
  });
  expect(displayDetails({ identity })["identity"]).toBe(identity);
});

test.each(CONTROL_UNITS)(
  "C-CLI-06c raw and escaped control %j cannot split an HTTP opener",
  (c) => {
    for (const url of controlledUrls(c)) {
      const text = `operation: ${url} ${SUFFIX}`;
      for (const input of [text, new CrewError("invalid_ref", text).message]) {
        expect(displayText(input)).toBe("operation: ***");
        expect(redactText(input)).toBe("operation: ***");
      }
      expect(displayDetails({ ref: url })).toEqual({ ref: "***" });
    }
  },
);

test("C-CLI-06c ambiguous HTTP email-like prose fails closed but normal protocol prose survives", () => {
  expect(displayText("HTTP: contact user@host for support")).toBe("***");
  expect(displayText("HTTP: request denied\nHTTPS: enabled")).toBe(
    "HTTP: request denied\nHTTPS: enabled",
  );
  expect(displayText(`source?token=${SECRET} https:/user@host/r`)).toBe("source?token=***");
  expect(displayText(`https:/user@host/r?token=${SECRET}`)).toBe("***");
});
