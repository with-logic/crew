/**
 * One temp root per test process: every directory a test makes through
 * `os.tmpdir()` lands under it, and it is removed once the process is
 * gone. Tests don't clean up after themselves, and a system temp folder
 * left holding hundreds of thousands of their directories slows every
 * file operation on the machine, until tests start timing out.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "crew-run-"));
process.env["TMPDIR"] = root;
// A watcher removes it after this process exits, not an `afterAll`: that
// runs again after each `--rerun-each` pass, while later passes still use
// the root, and never on a run that is interrupted. The watcher ignores
// the Ctrl-C sent to the whole terminal, and `rm -rf` gets past a folder
// a failed test left unreadable.
Bun.spawn(
  [
    "sh",
    "-c",
    'trap "" INT HUP TERM; while kill -0 "$0" 2>/dev/null; do sleep 1; done; rm -rf "$1"',
    String(process.pid),
    root,
  ],
  { stdio: ["ignore", "ignore", "ignore"] },
).unref();
