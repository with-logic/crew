/** Collection selection excludes unrelated same-named re-expansion groups (§10.1, §14). */

import { expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { tapLockTarget } from "../../../src/sources/tap-lock.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { acquireLock } from "../../../src/util/advisory-lock.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode } from "./helpers.ts";

redirectClaudeCode();

test("C-UPD-18d a qualified selection does not consult an unrelated same-named tap", () => {
  const home = makeCrewHome();
  const source = makeTempDir();
  makeSkill(source, "alpha", skillFrontmatter({ name: "alpha" }));
  runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
  expect(runCli(["tap", "add", source, "first"], { home, streams: captureStreams().streams })).toBe(
    0,
  );
  expect(runCli(["install", "first", "--tap"], { home, streams: captureStreams().streams })).toBe(
    0,
  );
  const other = makeTempDir();
  makeSkill(other, "alpha", skillFrontmatter({ name: "alpha" }));
  expect(runCli(["tap", "add", other, "second"], { home, streams: captureStreams().streams })).toBe(
    0,
  );
  const state = readState(home);
  const first = state.installations[0]!;
  writeState(
    {
      ...state,
      installations: [
        ...state.installations,
        {
          ...first,
          source: { ...first.source, tap: "second" },
          scope: "project",
          project_root: makeTempDir(),
        },
      ],
    },
    home,
  );
  const previous = process.env["CREW_LOCK_TIMEOUT_MS"];
  process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
  const held = acquireLock(tapLockTarget("second", home));
  try {
    expect(
      runCli(["update", "first/alpha", "--dry-run"], { home, streams: captureStreams().streams }),
    ).toBe(0);
  } finally {
    held.release();
    if (previous === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
    else process.env["CREW_LOCK_TIMEOUT_MS"] = previous;
  }
});
