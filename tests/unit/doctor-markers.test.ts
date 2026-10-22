/** Doctor's marker guard independently checks every required §7.5 field (§11.2). */
import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { invalidMarkerFinding } from "../../src/commands/doctor/markers/findings.ts";
import { scanMarkers } from "../../src/commands/doctor/markers/scan.ts";
import { isDoctorMarker } from "../../src/commands/doctor/markers/validate.ts";
import type { Marker } from "../../src/core/types.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

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

test("C-STATE-14 invalid marker diagnostics preserve path identity and escape controls", () => {
  const path = "/tmp/crew\nmarker/.crew.json";
  expect(
    invalidMarkerFinding(path, "invalid marker from https://alice:secret@example.com/skills.git"),
  ).toEqual([
    `marker_invalid\0${path}`,
    {
      level: "error",
      code: "marker_invalid",
      message:
        "/tmp/crew\\x0amarker/.crew.json: invalid marker from https://alice:***@example.com/skills.git",
    },
  ]);
});

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

test("C-STATE-14 valid git metadata passes the doctor guard", () => {
  expect(
    isDoctorMarker({
      ...marker,
      tap_kind: "git",
      tap_url: "https://example.com/skills.git",
      tap_path: "",
      ref: "main",
      resolved_sha: "a".repeat(40),
      tap_discovery: "recursive",
    }),
  ).toBe(true);
});

test("C-STATE-14 a valid tap name does not mask an invalid tap kind", () => {
  expect(isDoctorMarker({ ...marker, tap_kind: "bogus" })).toBe(false);
});

test("C-STATE-14 scanMarkers discovers a valid Git marker from disk", () => {
  const base = makeTempDir();
  const installDir = join(base, "demo");
  mkdirSync(installDir);
  const gitMarker: Marker = {
    ...marker,
    tap_kind: "git",
    tap_url: "https://example.com/skills.git",
    tap_path: "",
    ref: "main",
    resolved_sha: "a".repeat(40),
    content_hash: "b".repeat(64),
    tap_discovery: "recursive",
  };
  writeFileSync(join(installDir, ".crew.json"), JSON.stringify(gitMarker));
  const adapter = { ...claudeCodeAdapter, userPath: () => base };
  const inventory = scanMarkers(adapter, "user", base);
  expect(inventory.findings.size).toBe(0);
  expect(inventory.records).toEqual([
    { adapter: "claude-code", scope: "user", installDir, marker: gitMarker },
  ]);
});
