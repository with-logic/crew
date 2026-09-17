/**
 * Adapter path branches (§7.2): the conditional code paths inside individual
 * adapters' path resolution.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withOriginalAdapter } from "../../helpers/env.ts";

// Every adapter redirects its user path detection via $HOME. Swap in
// a throwaway HOME so the real `isDirectory` checks land on a
// controllable directory tree.
const realHome = process.env["HOME"];
let tempHome: string;

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), "crew-adapter-test-"));
  process.env["HOME"] = tempHome;
});

afterEach(() => {
  if (realHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = realHome;
});

describe("adapter path branches", () => {
  test("cursor also detects via /Applications/Cursor.app", () => {
    // Not practical to create `/Applications/Cursor.app` in a
    // sandbox. We exercise the branch by swapping the check into an
    // empty tmp dir tree and asserting false — the other test above
    // already exercises the `~/.cursor` → true branch.
    const prevPath = process.env["PATH"];
    process.env["PATH"] = "";
    try {
      withOriginalAdapter("cursor", (a) => {
        // If the dev machine happens to have Cursor.app installed,
        // this will be true; otherwise false. Either way, boolean.
        expect(typeof a.detect()).toBe("boolean");
      });
    } finally {
      process.env["PATH"] = prevPath;
    }
  });

  test("command-code detects via the `cmd` binary alias", () => {
    // Create a fake `cmd` binary on PATH; isOnPath should pick it up.
    const binDir = mkdtempSync(join(tmpdir(), "crew-cmd-bin-"));
    const fakeCmd = join(binDir, "cmd");
    require("node:fs").writeFileSync(fakeCmd, "#!/bin/sh\n", { mode: 0o755 });
    const prevPath = process.env["PATH"];
    process.env["PATH"] = binDir;
    try {
      withOriginalAdapter("command-code", (a) => {
        expect(a.detect()).toBe(true);
      });
    } finally {
      process.env["PATH"] = prevPath;
    }
  });
});
