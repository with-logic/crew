/** Linked inventory diagnostics preserve raw path identity and safe output (§11.2). */
import { expect, test } from "bun:test";
import type { Finding } from "../../src/commands/doctor/checks.ts";
import { inventoryLinkFailure } from "../../src/commands/doctor/markers/filesystem.ts";

test("C-STATE-14 distinct linked paths retain both keys when safe messages coincide", () => {
  const first = "/tmp/crew\nhttps://alice:first@example.com/linked/.crew.json";
  const second = "/tmp/crew\nhttps://alice:second@example.com/linked/.crew.json";
  const findings = new Map<string, Finding>();
  inventoryLinkFailure(first, findings);
  inventoryLinkFailure(second, findings);
  expect([...findings.keys()]).toEqual([`marker_invalid\0${first}`, `marker_invalid\0${second}`]);
  const expected: Finding = {
    level: "error",
    code: "marker_invalid",
    message:
      "/tmp/crew\\x0ahttps://alice:***@example.com/linked/.crew.json: symbolic link is invalid inventory; replace it with the managed entry before repair",
  };
  expect([...findings.values()]).toEqual([expected, expected]);
});
