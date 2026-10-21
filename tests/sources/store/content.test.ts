/** Store allocation preserves canonical bytes, hashes, and reuse (§6, §9 step 8, §12.1). */

import { expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { hashDirectory } from "../../../src/hash/content.ts";
import { stageIntoStore } from "../../../src/sources/store.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

test("fresh staging preserves source links, strips the root marker, and reuses canonical bytes", () => {
  const root = makeTempDir();
  const home = join(root, "home");
  const source = makeSkill(root, "demo", skillFrontmatter({ name: "demo" }));
  const outside = join(root, "outside");
  writeFileSync(outside, "outside bytes");
  writeFileSync(join(source, "payload"), "canonical bytes");
  writeFileSync(join(source, ".crew.json"), "untrusted source marker");
  symlinkSync(outside, join(source, "link"));
  const sourceHash = hashDirectory(source);
  const stored = stageIntoStore(source, "demo", null, home, sourceHash);
  expect(stored).toEqual({
    storePath: join(home, "store", `demo@${sourceHash.slice(7, 15)}`),
    contentHash: sourceHash,
    shortSha: sourceHash.slice(7, 15),
    reused: false,
  });
  expect(existsSync(join(stored.storePath, ".crew.json"))).toBe(false);
  expect(lstatSync(join(stored.storePath, "link")).isSymbolicLink()).toBe(true);
  expect(readlinkSync(join(stored.storePath, "link"))).toBe(outside);
  expect(readFileSync(outside, "utf8")).toBe("outside bytes");
  expect(readFileSync(join(stored.storePath, "payload"), "utf8")).toBe("canonical bytes");
  expect(stageIntoStore(source, "demo", null, home)).toEqual({ ...stored, reused: true });
  expect(readdirSync(join(home, "store"))).toEqual([`demo@${stored.shortSha}`]);
});
