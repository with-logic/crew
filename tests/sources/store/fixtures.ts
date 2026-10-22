/** Owned store fault fixtures exercise real publication and cleanup permissions (§9 step 8). */

import { mkdirSync, writeFileSync } from "node:fs";
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
