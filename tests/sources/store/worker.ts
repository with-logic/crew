/** Real process rendezvous for overlapping store staging (§6, §9 step 8). */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { stageIntoStore } from "../../../src/sources/store.ts";
import { setProgressSink } from "../../../src/util/progress.ts";

const [source, home, ready, release] = process.argv.slice(2) as [string, string, string, string];
setProgressSink(() => {
  writeFileSync(ready, "ready");
  while (!existsSync(release)) Bun.sleepSync(1);
  const start = Number(readFileSync(release, "utf8"));
  while (Date.now() < start) {}
});
const stored = stageIntoStore(source, "demo", "12345678".repeat(5), home);
console.log(JSON.stringify(stored));
