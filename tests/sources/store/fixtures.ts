/** Owned store fault fixtures exercise real publication and cleanup permissions (§9 step 8). */

import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

export function storeFixture() {
  const root = makeTempDir("crew-store-cleanup-\n");
  const home = join(root, "home");
  const store = join(home, "store");
  mkdirSync(store, { recursive: true });
  const source = makeSkill(root, "source", skillFrontmatter({ name: "demo" }));
  const peer = join(store, "peer@bbbbbbbb.staging-owned-by-another-call");
  mkdirSync(peer);
  writeFileSync(join(peer, "payload"), "peer bytes");
  return { root, home, store, source, peer, final: join(store, "demo@aaaaaaaa") };
}

/** A separate owner denies writes only after the real allocator creates this call's stage. */
export async function withDeniedStoreWrites(
  fixture: ReturnType<typeof storeFixture>,
  attempt: (ready: boolean) => void,
): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  const ready = join(fixture.root, "observer-ready");
  const script = `
const fs = require("node:fs");
const [store, ready] = process.argv.slice(1);
fs.writeFileSync(ready, "ready");
const deadline = Date.now() + 5000;
while (Date.now() < deadline) {
  if (fs.readdirSync(store).some(name => name.startsWith("demo@aaaaaaaa.staging-"))) {
    fs.chmodSync(store, 0o500);
    process.exit(0);
  }
}
process.exit(2);
`;
  const observer = Bun.spawn([process.execPath, "--eval", script, fixture.store, ready], {
    stdout: "ignore",
    stderr: "pipe",
  });
  try {
    const deadline = Date.now() + 3000;
    while (!existsSync(ready) && Date.now() < deadline) await Bun.sleep(1);
    attempt(existsSync(ready));
    return {
      exitCode: await observer.exited,
      stderr: await new Response(observer.stderr).text(),
    };
  } finally {
    // Reap the observer before restoring permissions, even when an assertion fails.
    observer.kill();
    await observer.exited;
    chmodSync(fixture.store, 0o700);
  }
}
