/** Unstructured diagnostic credential boundaries and compatibility (§5.2, §13, C-REF-28). */

import { expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { displayDetails, displayText, displayUrl } from "../../src/refs/display-url.ts";
import { redactText, safeUrl } from "../../src/util/redact.ts";

test.each(["'", '"', "<", ">", "`"])(
  "C-REF-28 direct diagnostic boundary suppresses %s inside an authority",
  (delimiter) => {
    const text = `fatal: 'https://user:${delimiter}AUTHORITY_SECRET@host/repo': denied`;
    expect(displayText(text)).toBe("fatal: '***");
    expect(redactText(text)).not.toContain("AUTHORITY_SECRET");
  },
);

test.each(["'", '"', "<", ">", "`", " ", "\n", "\r", "\t", "\u0085"])(
  "C-REF-28 direct query boundary suppresses %j and the whole ambiguous tail",
  (delimiter) => {
    for (const prefix of ["/repo", "https://host/repo"]) {
      const text = `fatal: ${prefix}?ref=main&token=${delimiter}QUERY_SECRET&version=1': denied`;
      expect(displayText(text)).toBe(`fatal: ${prefix}?ref=main&token=***`);
      expect(redactText(text)).not.toContain("QUERY_SECRET");
    }
  },
);

test.each([".,;:)]", "'\"<>`.,;:)]"])(
  "C-REF-28 direct query boundary does not restore punctuation-only credential %s",
  (secret) => {
    expect(displayText(`fatal: /repo?token=${secret}`)).toBe("fatal: /repo?token=***");
  },
);

test.each([" ", "\n", "\r", "\t", "\u0085"])(
  "C-REF-28 direct authority boundary suppresses credential whitespace %j",
  (separator) => {
    const raw = `fatal: https://user:${separator}SPACE_SECRET@host/repo denied`;
    for (const text of [raw, new CrewError("source_unreachable", raw).message])
      expect(displayText(text)).toBe("fatal: ***");
  },
);

test.each(["", "\n", "\r", "\t", "\u0085", "\\x0a"])(
  "C-REF-28 adjacent URL openers separated by %j cannot swallow userinfo",
  (separator) => {
    const raw = `fatal: https://host/one${separator}https://user:ADJACENT_SECRET@host/two unavailable`;
    for (const text of [raw, new CrewError("source_unreachable", raw).message]) {
      expect(displayText(text)).toBe("fatal: ***");
      expect(redactText(text)).not.toContain("ADJACENT_SECRET");
    }
  },
);

test("C-REF-28 direct query boundary decodes keys and handles many question marks plus fragment", () => {
  const text = `fatal: /repo?%63lient_secret=${"?".repeat(16_000)}#FRAGMENT_SECRET`;
  expect(displayText(text)).toBe("fatal: /repo?%63lient_secret=***");
});

test("C-REF-28 raw details strings use the same query/authority policy and retain keys", () => {
  const details = displayDetails({
    path: "/source?token=\nDETAIL_SECRET",
    url: "https://user: DETAIL_SECRET@host/repo",
    count: 3,
  });
  expect(details).toEqual({ path: "/source?token=***", url: "***", count: 3 });
});

test("C-REF-28 ordinary unambiguous URLs keep surrounding prose", () => {
  expect(displayText("fatal: 'https://user:secret@host/repo': denied")).toBe(
    "fatal: 'https://***@host/repo': denied",
  );
  expect(displayText("first https://host/one then https://host/two done")).toBe(
    "first https://host/one then https://host/two done",
  );
});

test("C-REF-28 ordinary no-URL prose and multiline layout survive", () => {
  expect(displayText("What now?\nTry again.\nline\tthree\u001b")).toBe(
    "What now?\nTry again.\nline\\x09three\\x1b",
  );
  expect(displayText("fetched /repo?version=1 ok")).toContain("version=1");
});

test("C-CLI-06b structured URL boundaries retain safe parameters and SSH account behavior", () => {
  const url = "https://user:secret@host/repo?token=secret&version=1&ref=main&service=git";
  expect(displayUrl(url)).toBe("https://***@host/repo?token=***&version=1&ref=main&service=git");
  expect(safeUrl(url)).toBe("https://user:***@host/repo?token=***&version=1&ref=main&service=git");
  expect(safeUrl("ssh://git@host/repo")).toBe("ssh://git@host/repo");
  expect(displayUrl("ssh://git@host/repo")).toBe("ssh://***@host/repo");
});
