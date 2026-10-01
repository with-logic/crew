/**
 * Source credentials stay out of real human/JSON CLI output (§13,
 * C-REF-28, C-TAP-26), including refresh previews and scheme-less git errors.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import { tapWithUrl } from "./verbose/helpers.ts";

const SECRET = "PR113_PRIVATE_CREDENTIAL";

describe("credential query values never reach CLI output", () => {
  test.each([false, true])("C-REF-28 tap collision masks client_secret (json=%s)", (json) => {
    const home = makeCrewHome();
    tapWithUrl(home, "https://host/existing/repo.git");
    const capture = captureStreams();
    expect(
      runCli(
        [
          "tap",
          "add",
          `https://host/other/repo.git?client_secret=${SECRET}`,
          "creds",
          ...(json ? ["--json"] : []),
        ],
        { home, streams: capture.streams },
      ),
    ).toBe(4);
    const output = capture.stdout() + capture.stderr();
    expect(output).not.toContain(SECRET);
    expect(output).toContain("client_secret=***");
    if (json) expect(JSON.parse(capture.stdout()).error.name).toBe("usage_error");
  });

  test.each([false, true])("C-TAP-26 tap refresh dry-run masks credentials (json=%s)", (json) => {
    const home = makeCrewHome();
    tapWithUrl(home, `https://user:${SECRET}@host/repo.git?client_secret=${SECRET}&sig=${SECRET}`);
    const capture = captureStreams();
    expect(
      runCli(["tap", "update", "--dry-run", "creds", ...(json ? ["--json"] : [])], {
        home,
        streams: capture.streams,
      }),
    ).toBe(0);
    const output = capture.stdout() + capture.stderr();
    expect(output).not.toContain(SECRET);
    if (json) expect(JSON.parse(capture.stdout()).rows[0].kind).toBe("pending");
    expect(output).toContain("client_secret=***");
    expect(output).toContain("sig=***");
  });

  test.each([false, true])("C-REF-28 malformed URL errors fail closed (json=%s)", (json) => {
    const capture = captureStreams();
    expect(
      runCli(
        [
          "install",
          `https://user:${SECRET}@host:99999/repo?client_secret=${SECRET}`,
          ...(json ? ["--json"] : []),
        ],
        { home: makeCrewHome(), streams: capture.streams },
      ),
    ).toBe(4);
    const output = capture.stdout() + capture.stderr();
    expect(output).not.toContain(SECRET);
    expect(output).toContain("***");
    if (json) expect(JSON.parse(capture.stdout()).error.name).toBe("invalid_ref");
  });

  test.each(["client_secret", "sig", "provider_credential"])(
    "C-REF-28 git's scheme-less %s query is masked in errors",
    (parameter) => {
      const url = `file://${makeTempDir("crew-missing-")}/absent.git?${parameter}=${SECRET}`;
      for (const json of [false, true]) {
        const home = makeCrewHome();
        const capture = captureStreams();
        expect(
          runCli(["tap", "add", url, "creds", ...(json ? ["--json"] : [])], {
            home,
            streams: capture.streams,
          }),
        ).toBe(5);
        const output = capture.stdout() + capture.stderr();
        expect(output).not.toContain(SECRET);
        if (json) expect(JSON.parse(capture.stdout()).error.name).toBe("source_unreachable");
        expect(output).toContain(`${parameter}=***`);
        expect(output).toContain("does not appear to be a git repository");
      }
    },
  );
});
