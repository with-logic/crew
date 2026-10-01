/**
 * `writeText` temp-file hygiene (§6).
 *
 * The temp sibling can hold whatever the caller was writing — `config.yaml`
 * carries credential-bearing clone URLs — so a failed write or rename must
 * not leave it on disk.
 */

import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeText } from "../../src/util/fs.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

test("writeText leaves no temp sibling when the rename fails", () => {
  const dir = makeTempDir("crew-tmpclean-");
  const target = join(dir, "config.yaml");
  // A directory cannot be replaced by renaming a file over it, so this
  // drives the failure path without touching permissions.
  mkdirSync(target, { recursive: true });

  expect(() => writeText(target, "taps: []\n")).toThrow();

  expect(readdirSync(dir).filter((f) => f.includes(".tmp-"))).toEqual([]);
  expect(existsSync(target)).toBe(true);
});
