/** Independent HTTP candidates preserve later openers with bounded monotonic work (§13, C-CLI-06c). */

import { expect, test } from "bun:test";
import { displayText } from "../../../src/refs/display-url.ts";
import { redactText } from "../../../src/util/redact.ts";
import { SECRET } from "./cases.ts";

test.each(["HTTP: request ", "HTTP: request HTTPS: denied ", "http: label ".repeat(8_000)])(
  "C-CLI-06c earlier zero-separator labels cannot swallow a later malformed opener (case %#)",
  (prefix) => {
    const text = `${prefix}https:/${SECRET}@host.invalid/o/r trailing`;
    expect(displayText(text)).toBe(`${prefix}***`);
    expect(redactText(text)).toBe(`${prefix}***`);
  },
);

test("C-CLI-06c adjacent valid and malformed openers do not restore credential suffixes", () => {
  const text = `operation: https://host.invalid/o/r>https:/${SECRET}@host.invalid/o/r`;
  expect(displayText(text)).not.toContain(SECRET);
  expect(redactText(text)).not.toContain(SECRET);
});

test("C-CLI-06c long control runs and repeated harmless labels remain functional", () => {
  const controls = "\\x09".repeat(8_000);
  expect(displayText(`operation: ht${controls}tps:\\${SECRET}@host.invalid/o/r`)).toBe(
    "operation: ***",
  );
  const plain = "HTTP: request denied; ".repeat(8_000);
  expect(displayText(plain)).toBe(plain);
});

test("C-CLI-06c a malformed-looking suffix of a larger path name is preserved", () => {
  const text = `operation: https://host.invalid/o/rhttps:/${SECRET}@host.invalid/o/r`;
  expect(displayText(text)).toBe(text);
  expect(redactText(text)).toBe(text);
});

test.each([
  "xhttps:\\TOKEN@host/r",
  "httpsx:\\TOKEN@host/r",
  "http s:\\TOKEN@host/r",
  "https%3A\\TOKEN@host/r",
  "https：\\TOKEN@host/r",
  "plain first line\nplain second line",
])("C-CLI-06c non-HTTP or ordinary prose %j stays readable", (text) => {
  expect(displayText(text)).toBe(text);
});
