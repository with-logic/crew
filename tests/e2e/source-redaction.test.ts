/** Real filesystem operational errors retain confidentiality in both CLI channels (§5.2, §13). */

import { expect, test } from "bun:test";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

test.each([" ", "\n", "\r", "\t"])(
  "C-REF-28 real source filesystem error masks %j credential suffix in human and JSON output",
  (separator) => {
    const source = join(makeTempDir(), `source?token=${separator}SOURCE_SECRET`, "demo");
    mkdirSync(source, { recursive: true });
    chmodSync(source, 0);
    try {
      for (const json of [false, true]) {
        const capture = captureStreams();
        expect(
          runCli(["install", source, "--agent", "claude-code", ...(json ? ["--json"] : [])], {
            home: makeCrewHome(),
            streams: capture.streams,
          }),
        ).toBe(5);
        const output = capture.stdout() + capture.stderr();
        expect(output).not.toContain("SOURCE_SECRET");
        expect(output).toContain("cannot inspect source");
        expect(output).toContain("token=***");
        if (json) {
          const error = JSON.parse(capture.stdout()).error;
          expect(error.name).toBe("source_unreachable");
          expect(Object.keys(error).sort()).toEqual(["details", "message", "name"]);
          expect(Object.keys(error.details)).toEqual(["path"]);
          expect(error.details.path).toBe(
            `${source.slice(0, source.indexOf("?token="))}?token=***`,
          );
        } else {
          expect(output).toContain("Next step");
          expect(output).toContain("Check that the source directory can be listed and searched");
        }
      }
    } finally {
      chmodSync(source, 0o700);
    }
  },
);
