/** Doctor's marker guard independently checks every required §7.5 field (§11.2). */
import { expect, test } from "bun:test";
import { isDoctorMarker } from "../../src/commands/doctor/markers/validate.ts";
import type { Marker } from "../../src/core/types.ts";

const marker: Marker = {
  schema_version: 1,
  name: "demo",
  agents: ["claude-code"],
  tap_name: "local",
  tap_kind: "path",
  tap_url: "",
  tap_subpath: "",
  tap_path: "/tmp/crew-source",
  path: "",
  ref: null,
  resolved_sha: null,
  content_hash: "abc",
  scope: "user",
  installed_at: "2026-10-21T00:00:00.000Z",
  installed_by: "crew",
};

test("C-STATE-14 a complete typed marker passes the doctor guard", () => {
  expect(isDoctorMarker(marker)).toBe(true);
});
for (const key of Object.keys(marker)) {
  test(`C-STATE-14 doctor rejects missing or wrongly typed ${key}`, () => {
    const missing: Record<string, unknown> = { ...marker };
    delete missing[key];
    expect(isDoctorMarker(missing)).toBe(false);
    expect(isDoctorMarker({ ...marker, [key]: {} })).toBe(false);
  });
}
