/** Leading question marks stay in decoded diagnostic keys, including real Git CLI errors (§13, C-REF-28). */

import { expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { displayDetails, displayText } from "../../src/refs/display-url.ts";
import { redactText } from "../../src/util/redact.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

const UNKNOWN_KEYS = ["?version", "?ref", "?service", "%3Fversion", "%3fref", "%3Fservice"];

for (const key of UNKNOWN_KEYS) {
  for (const source of ["/repo", "https://host/repo"]) {
    for (const parameters of ["?", "?version=1&"]) {
      test(`C-REF-28 direct boundary preserves the complete ${source}${parameters}${key} key`, () => {
        const prefix = `fatal: ${source}${parameters}${key}=`;
        const text = `${prefix}QUERY_SECRET&ref=SUFFIX_SECRET': denied`;
        expect(displayText(text)).toBe(`${prefix}***`);
        expect(redactText(text)).toBe(`${prefix}***`);
      });
    }
  }
}

test.each(UNKNOWN_KEYS)(
  "C-REF-28 details preserve the complete leading %s key and stable object keys",
  (key) => {
    expect(
      displayDetails({
        path: `/repo?${key}=DETAIL_SECRET&ref=SUFFIX_SECRET`,
        url: `https://host/repo?ref=main&${key}=DETAIL_SECRET': denied`,
        count: 2,
      }),
    ).toEqual({
      path: `/repo?${key}=***`,
      url: `https://host/repo?ref=main&${key}=***`,
      count: 2,
    });
  },
);

test("C-REF-28 ordinary allowlisted query keys stay readable", () => {
  const url = "https://host/repo?version=1&ref=main&service=git";
  expect(displayText(url)).toBe(url);
  expect(redactText(url)).toBe(url);
  expect(displayDetails({ url })).toEqual({ url });
});

for (const key of ["?version", "?ref", "?service"]) {
  for (const parameters of ["?", "?version=1&"]) {
    test.each([false, true])(
      `C-REF-28 actual local Git CLI masks ${parameters}${key} (json=%j)`,
      (json) => {
        const url = `file://${makeTempDir()}/missing.git${parameters}${key}=GIT_SECRET&ref=SUFFIX_SECRET`;
        const capture = captureStreams();
        expect(
          runCli(["tap", "add", url, "creds", ...(json ? ["--json"] : [])], {
            home: makeCrewHome(),
            streams: capture.streams,
          }),
        ).toBe(5);
        const output = capture.stdout() + capture.stderr();
        expect(output).not.toContain("GIT_SECRET");
        expect(output).not.toContain("SUFFIX_SECRET");
        expect(output).toContain("couldn't clone");
        expect(output).toContain("***");
        if (json) {
          const error = JSON.parse(capture.stdout()).error;
          expect(error.name).toBe("source_unreachable");
          expect(Object.keys(error).sort()).toEqual(["details", "message", "name"]);
          expect(Object.keys(error.details)).toEqual(["url"]);
          expect(error.details.url).toBe(`${url.slice(0, url.indexOf("=GIT_SECRET"))}=***`);
        } else {
          expect(output).toContain("source_unreachable");
          expect(output).toContain("Next step");
          expect(output).toContain("Homecrew couldn't reach the source");
        }
      },
    );
  }
}
