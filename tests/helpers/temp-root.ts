/**
 * One temp root per test process: every directory a test makes through
 * `os.tmpdir()` lands under it, and it is removed once the process is
 * gone. Tests don't clean up after themselves, and a system temp folder
 * left holding hundreds of thousands of their directories slows every
 * file operation on the machine, until tests start timing out. (Under
 * `bun test --watch` the process lives on, so every reload's root stays
 * until the session ends.)
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "crew-run-"));
process.env["TMPDIR"] = root;
// A watcher removes it after this process exits, not an `afterAll`: that
// runs again after each `--rerun-each` pass, while later passes still use
// the root, and never on a run that is interrupted. The watcher ignores
// the Ctrl-C sent to the whole terminal. Should `rm -rf` fail on a folder
// an interrupted test left at mode 000, it makes what's left writable and
// removes it again. "crew-temp-root" fills `$0` (the name `ps` shows); the
// pid and root are `$1` and `$2`.
const WATCHER = [
  'trap "" INT HUP TERM',
  'while kill -0 "$1" 2>/dev/null; do sleep 1; done',
  'rm -rf "$2" 2>/dev/null || { chmod -R u+rwx "$2" 2>/dev/null; rm -rf "$2"; }',
].join("; ");
Bun.spawn(["sh", "-c", WATCHER, "crew-temp-root", String(process.pid), root], {
  stdio: ["ignore", "ignore", "ignore"],
}).unref();
