/** Malformed scheme-less references never echo credential queries (PRD §8.2/§13, C-REF-32c). */

import { expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

test.each([false, true])("C-REF-32c malformed credential query is redacted (json: %s)", (json) => {
  const secret = "PRIVATE_SCHEMELESS_SENTINEL";
  const capture = captureStreams();
  const code = runCli(["install", `github.com?token=${secret}/o/r`, ...(json ? ["--json"] : [])], {
    home: makeCrewHome(),
    streams: capture.streams,
  });
  expect(code).toBe(4);
  expect(capture.stdout() + capture.stderr()).not.toContain(secret);
  expect(capture.stdout() + capture.stderr()).toContain("***");
  if (json) {
    const result = JSON.parse(capture.stdout());
    expect(result.error.name).toBe("invalid_ref");
    expect(result.error.details.ref).toContain("***");
  } else {
    expect(capture.stderr()).toContain("invalid_ref");
  }
});
