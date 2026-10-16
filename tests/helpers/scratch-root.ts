/**
 * One temp root per test process: every directory a test makes through
 * `os.tmpdir()` lands under it, and it is removed when the process exits.
 * Tests don't clean up after themselves, and a system temp folder left
 * holding hundreds of thousands of their directories slows every file
 * operation on the machine, until tests start timing out.
 */

import { afterAll } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "crew-run-"));
process.env["TMPDIR"] = root;
// Registered from the preload, so it runs once, after every test file.
// A detached `rm -rf`, not `rmSync`: removing thousands of folders must
// not hold up the run (or time out its hook), and a folder a failed test
// left unreadable must not fail it.
afterAll(() => {
  Bun.spawn(["rm", "-rf", root], { stdio: ["ignore", "ignore", "ignore"] }).unref();
});
