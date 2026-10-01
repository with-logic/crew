/** Untrusted state input validation and doctor recovery (§11.1, §11.2). */

import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../src/cli/main.ts";
import type { StateEntry } from "../../src/core/types.ts";
import { readState } from "../../src/state/load.ts";
import { isStateEntry } from "../../src/state/validation.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

const entry: StateEntry = {
  name: "demo",
  source: { tap: "core", path: "demo" },
  ref: null,
  resolved_sha: null,
  content_hash: "sha256:x",
  scope: "user",
  installed_at: "2026-01-01T00:00:00Z",
  agents: ["claude-code"],
  pinned: false,
  explicit: true,
  required_by: [],
};

test("untrusted records are validated before state consumers see them", () => {
  for (const invalid of [
    null,
    42,
    [],
    {},
    { ...entry, source: null },
    { ...entry, agents: null },
    { ...entry, agents: [42] },
    { ...entry, required_by: [null] },
  ]) {
    expect(isStateEntry(invalid)).toBe(false);
  }
  expect(isStateEntry(entry)).toBe(true);
  expect(isStateEntry({ ...entry, ref: "v1", resolved_sha: "abc", required_by: ["parent"] })).toBe(
    true,
  );
  const home = makeCrewHome();
  writeFileSync(
    join(home, "state.json"),
    JSON.stringify({ schema_version: 1, installations: [null, entry] }),
  );
  expect(readState(home).installations).toEqual([entry]);
  expect(
    runCli(["doctor", "--repair"], { home, cwd: home, streams: captureStreams().streams }),
  ).toBe(0);
});
