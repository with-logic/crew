/** Doctor's unreadable summary covers the entire marker inventory (§11.2, C-STATE-14). */
import { expect, test } from "bun:test";
import { renderDoctor } from "../../../src/commands/doctor/render.ts";
import { makeStyler } from "../../../src/util/term.ts";

test("C-STATE-14 an unreadable inventory directory needs attention and blocks every preview repair", () => {
  const lines = renderDoctor(
    [
      { level: "error", code: "marker_unreadable", message: "/tmp/project: permission denied" },
      { level: "error", code: "state_entry_without_marker", message: "state lists demo" },
    ],
    {
      repair: true,
      verify: false,
      dryRun: true,
      applied: false,
      markerInventoryBlocksRepair: true,
    },
    makeStyler(false),
  ).join("\n");
  expect(lines).toContain("marker inventory could not be inspected; repair is blocked");
  expect(lines).toContain("/tmp/project: permission denied");
  expect(lines).toContain("would address 0 findings");
  expect(lines).not.toContain("would be repaired");
});
