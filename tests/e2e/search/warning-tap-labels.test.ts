/** Existing configured-search warnings escape tap labels and commands (§5.1, §16.6). */

import { expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import type { ConfiguredSearchResult } from "../../../src/commands/search/types.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeTempDir } from "../../helpers/fixtures.ts";

for (const invalidSubpath of [false, true]) {
  for (const controlledName of [false, true]) {
    test(`configured ${invalidSubpath ? "invalid-ref" : "unreachable"} warning for ${controlledName ? "control-bearing" : "ordinary"} tap stays actionable on one line`, () => {
      const home = makeCrewHome();
      const repo = makeTempDir();
      if (invalidSubpath) makeGitRepo(repo);
      const name = controlledName ? "local\nforged\x1b[31m\x07\x7f\x85\x9b" : "local";
      const escaped = controlledName ? "local\\x0aforged\\x1b[31m\\x07\\x7f\\x85\\x9b" : name;
      const tap = {
        name,
        kind: "git" as const,
        registered: true,
        url: `file://${invalidSubpath ? repo : join(repo, "missing")}`,
        subpath: invalidSubpath ? "../outside" : "",
        path: "",
      };
      writeConfig({ ...readConfig(home), taps: [tap] }, home);
      const before = readConfig(home);
      for (const json of [false, true]) {
        const capture = captureStreams();
        expect(
          runCli(["search", "--tap", name, ...(json ? ["--json"] : [])], {
            home,
            streams: capture.streams,
          }),
        ).toBe(0);
        let warning = capture.stderr().trim();
        if (json) {
          const payload: Pick<ConfiguredSearchResult, "warnings"> = JSON.parse(capture.stdout());
          warning = payload.warnings[0] ?? "";
        }
        expect(warning).toContain(`warning: tap \`${escaped}\``);
        expect(warning).not.toContain("\n");
        for (const control of ["\x1b", "\x07", "\x7f", "\x85", "\x9b"]) {
          expect(warning).not.toContain(control);
        }
        if (invalidSubpath) {
          expect(warning).toContain("skipped");
          expect(warning).toContain("outside");
        } else {
          const command = controlledName ? "crew tap update" : `crew tap update ${name}`;
          expect(warning).toBe(
            `warning: tap \`${escaped}\` isn't cloned yet and couldn't be reached — skipping. run \`${command}\` when you're back online.`,
          );
        }
      }
      expect(readConfig(home)).toEqual(before);
    });
  }
}
