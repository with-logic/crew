/** Bound one owned Bun owner-read child; never read its metadata here (§14). */
import { existsSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [modulePath, target, kind] = process.argv.slice(2) as [string, string, string];
const root = dirname(target);
const owner = `${target}.lock.owner`;
const ready = join(root, "ready");
if (kind === "fifo" || kind === "symlink-fifo") {
  const fifo = join(root, "fifo");
  const created = Bun.spawnSync(["mkfifo", fifo]);
  if (created.exitCode !== 0) throw new Error(created.stderr.toString());
  if (kind === "fifo") renameSync(fifo, owner);
  else symlinkSync(fifo, owner);
} else if (kind === "malformed") writeFileSync(owner, "invalid record");

const script = `
import {mkdirSync,statSync,utimesSync,writeFileSync} from "node:fs";
import {acquireLock} from ${JSON.stringify(modulePath)};
const target=${JSON.stringify(target)};
if(${JSON.stringify(kind)}==="oversized"){
 mkdirSync(target+".lock");utimesSync(target+".lock",new Date(0),new Date(0));
 const stat=statSync(target+".lock");
 writeFileSync(target+".lock.owner",process.pid+" "+stat.ino+" "+stat.birthtimeMs+" "+"x".repeat(1024*1024));
}
writeFileSync(${JSON.stringify(ready)},String(process.pid));
acquireLock(target,100).release();
`;
const child = Bun.spawn([process.execPath, "-e", script], {
  stdout: Bun.file(join(root, "stdout")),
  stderr: Bun.file(join(root, "stderr")),
});
let reason = "startup";
const started = performance.now();
let readyAt: number | undefined;
let maximumRss = 0;
try {
  while (child.exitCode === null) {
    const now = performance.now();
    if (readyAt === undefined && existsSync(ready)) readyAt = now;
    const rss = Bun.spawnSync(["ps", "-o", "rss=", "-p", String(child.pid)], {
      timeout: 500,
    });
    const value = Number(rss.stdout.toString().trim() || "0");
    maximumRss = Math.max(maximumRss, value);
    if (value > 256 * 1024) {
      reason = "rss-guard";
      break;
    }
    if (now - started > 10_000) {
      reason = "outer-watchdog";
      break;
    }
    if (readyAt !== undefined && now - readyAt > 1_000) {
      reason = "acquisition-wall";
      break;
    }
    if (readyAt === undefined && now - started > 5_000) {
      reason = "startup-wall";
      break;
    }
    await Bun.sleep(50);
  }
  if (child.exitCode !== null) reason = "exited";
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([child.exited, Bun.sleep(200)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  await child.exited;
}
console.log(
  JSON.stringify({
    reason,
    ready: existsSync(ready),
    exit:
      child.signalCode === "SIGTERM" ? -15 : child.signalCode === "SIGKILL" ? -9 : child.exitCode,
    pid: child.pid,
    max_rss_kib: maximumRss,
    joined: true,
    stderr: readFileSync(join(root, "stderr")).subarray(0, 4096).toString(),
  }),
);
