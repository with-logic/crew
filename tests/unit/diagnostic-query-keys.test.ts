/** Complete decoded query keys govern diagnostic confidentiality (§13, C-REF-28). */

import { expect, test } from "bun:test";
import { displayDetails, displayText } from "../../src/refs/display-url.ts";
import { redactText } from "../../src/util/redact.ts";

test.each([
  "token?version",
  "client_secret?ref",
  "password?service",
  "token%3Fversion",
  "client_secret%3fref",
  "sig%3Fservice",
])("C-REF-28 direct diagnostic boundary checks the complete decoded %s key", (key) => {
  for (const source of ["/repo", "https://host/repo"]) {
    for (const parameters of ["?", "?version=1&"]) {
      const prefix = `fatal: ${source}${parameters}${key}=`;
      const text = `${prefix}QUERY_SECRET&ref=SUFFIX_SECRET': denied`;
      expect(displayText(text)).toBe(`${prefix}***`);
      expect(redactText(text)).toBe(`${prefix}***`);
    }
  }
});

test.each(["token?version", "client_secret?ref", "password?service", "token%3Fversion"])(
  "C-REF-28 details mask the full %s key value and retain stable keys",
  (key) => {
    const details = displayDetails({
      path: `/repo?${key}=DETAIL_SECRET&service=SUFFIX_SECRET`,
      url: `https://host/repo?ref=main&${key}=DETAIL_SECRET': denied`,
      count: 2,
    });
    expect(details).toEqual({
      path: `/repo?${key}=***`,
      url: `https://host/repo?ref=main&${key}=***`,
      count: 2,
    });
  },
);

test("C-REF-28 ordinary version/ref/service query keys remain displayable", () => {
  for (const source of ["/repo", "https://host/repo"]) {
    const text = `fetched ${source}?version=1&ref=main&service=git`;
    expect(displayText(text)).toBe(text);
    expect(redactText(text)).toBe(text);
  }
});
