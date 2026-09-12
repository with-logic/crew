/**
 * Previewing an explicit `@<ref>` with `crew info` (§9.1).
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { twoCommitRepo, useRedirectedAdapter } from "./helpers.ts";

useRedirectedAdapter();

describe("crew info at an explicit ref", () => {
  test("C-INST-05b info previews the ref's content", () => {
    const home = makeCrewHome();
    const { repo } = twoCommitRepo();
    const cap = captureStreams();
    const code = runCli(["info", `file://${repo}@v1//demo`, "--json"], {
      home,
      streams: cap.streams,
    });

    expect(code).toBe(0);
    const payload = JSON.parse(cap.stdout()) as { skills: { description: string }[] };
    expect(payload.skills[0]!.description).toBe("VERSION ONE");
  });
});
