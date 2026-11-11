/**
 * `failureReason` (§7.4): the fixed wording for a removal failure, and
 * which failures it says `--force` overrides.
 */

import { expect, test } from "bun:test";
import { failureReason } from "../../src/commands/uninstall/render.ts";

test.each(["untracked_directory", "inconsistent_marker", "not_installed_here"])(
  "%s is a safety check --force overrides, and says so",
  (code) => {
    expect(failureReason(code)).toContain("--force");
  },
);

test("a failure --force does not override gets no such hint", () => {
  expect(failureReason("unknown_agent")).not.toContain("--force");
});

test("a code with no wording of its own is spelled out", () => {
  expect(failureReason("filesystem_error")).toBe("filesystem error");
});
