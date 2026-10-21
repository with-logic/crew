/** Independent processes must own their store scratch bytes (§6, §9 step 8). */

import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashDirectory } from "../../../src/hash/content.ts";
import type { StoredSkill } from "../../../src/sources/store.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

test("independent processes stage the same store target without sharing scratch bytes", async () => {
  const root = makeTempDir("crew-store-processes-");
  const home = join(root, "home");
  const slow = makeSkill(root, "slow", skillFrontmatter({ name: "demo" }));
  const fast = makeSkill(root, "fast", skillFrontmatter({ name: "demo" }));
  // Different copy sizes exercise overlapping scratch writes without requiring a publication order.
  for (let i = 0; i < 150; i++) writeFileSync(join(slow, `payload-${i}`), `bytes-${i}`);
  writeFileSync(join(fast, "payload"), "fast bytes");
  mkdirSync(home);
  const release = join(root, "release");
  const sources = [slow, fast];
  const ready = sources.map((_, i) => join(root, `ready-${i}`));
  const children = sources.map((source, i) =>
    Bun.spawn(
      [process.execPath, join(import.meta.dir, "worker.ts"), source, home, ready[i]!, release],
      {
        cwd: import.meta.dir,
        stdout: "pipe",
        stderr: "pipe",
      },
    ),
  );
  try {
    for (let attempt = 0; attempt < 2000 && !ready.every(existsSync); attempt++) await Bun.sleep(5);
    expect(ready.every(existsSync)).toBe(true);
    writeFileSync(release, String(Date.now() + 100));
    const results = await Promise.all(
      children.map(async (child) => ({
        code: await child.exited,
        stdout: await new Response(child.stdout).text(),
        stderr: await new Response(child.stderr).text(),
      })),
    );
    expect(results.map((result) => ({ code: result.code, stderr: result.stderr }))).toEqual([
      { code: 0, stderr: "" },
      { code: 0, stderr: "" },
    ]);
    for (let i = 0; i < results.length; i++) {
      const stored = JSON.parse(results[i]!.stdout) as StoredSkill;
      expect(stored.reused).toBe(false);
      expect(stored.contentHash).toBe(hashDirectory(sources[i]!));
    }
    expect(sources.map((source) => hashDirectory(source))).toContain(
      hashDirectory(join(home, "store", "demo@12345678")),
    );
    expect(readdirSync(join(home, "store"))).toEqual(["demo@12345678"]);
  } finally {
    for (const child of children) child.kill();
    await Promise.all(children.map((child) => child.exited));
  }
}, 20_000);
