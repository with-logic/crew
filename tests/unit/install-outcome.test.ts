/**
 * `installOutcome` (§9 step 9): the exit code of an install and whether
 * everything landed, for each way a run can end.
 */

import { expect, test } from "bun:test";
import { type InstallTally, installOutcome } from "../../src/commands/install/exit-code.ts";

const OK = { anySuccess: true };
const FAILED = { anySuccess: false };

/** A tally with these install records, and this many already-installed and skipped skills. */
function tally(
  records: InstallTally["summary"]["records"],
  counts: { alreadyInstalled?: number; skipped?: number } = {},
): InstallTally {
  return {
    summary: { records },
    alreadyInstalled: new Array(counts.alreadyInstalled ?? 0).fill("skill"),
    skipped: new Array(counts.skipped ?? 0).fill("skill"),
  };
}

test.each([
  ["nothing to do", tally([])],
  ["every skill installed", tally([OK, OK])],
  ["everything was already installed", tally([], { alreadyInstalled: 2 })],
])("%s is exit 0, and everything landed", (_what, result) => {
  expect(installOutcome(result)).toEqual({ exitCode: 0, everythingLanded: true });
});

test.each([
  ["one skill installed and one failed", tally([OK, FAILED])],
  ["one skill installed and one was invalid", tally([OK], { skipped: 1 })],
  ["some already installed and one invalid", tally([], { alreadyInstalled: 1, skipped: 1 })],
  ["every install failed, none invalid", tally([FAILED, FAILED])],
])("%s is exit 1, and not everything landed", (_what, result) => {
  expect(installOutcome(result)).toEqual({ exitCode: 1, everythingLanded: false });
});

test.each([
  ["nothing succeeded and a skill was invalid", tally([], { skipped: 1 })],
  ["an install failed and another skill was invalid", tally([FAILED], { skipped: 1 })],
])("%s is exit 4, and not everything landed", (_what, result) => {
  expect(installOutcome(result)).toEqual({ exitCode: 4, everythingLanded: false });
});
