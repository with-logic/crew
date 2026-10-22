/** Source-copy wrappers forward the trusted destination boundary (§7.3, §12.1). */
import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { copySourceTree } from "../../../src/sources/read.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

test("source copying refuses a linked ancestor below its explicit trusted root", () => {
  const root = makeTempDir("crew-source-copy-boundary-");
  const source = join(root, "source");
  const trusted = join(root, "trusted");
  const outside = join(root, "outside");
  for (const dir of [source, trusted, outside]) mkdirSync(dir);
  writeFileSync(join(source, "payload"), "replacement bytes");
  const protectedFile = join(outside, "payload");
  writeFileSync(protectedFile, "outside bytes");
  const ancestor = join(trusted, "linked");
  symlinkSync(outside, ancestor);
  const destination = join(ancestor, "nested");
  let error: unknown;
  try {
    copySourceTree(source, destination, trusted);
  } catch (caught) {
    error = caught;
  }
  expect(error).toMatchObject({ code: "usage_error" });
  expect(existsSync(join(outside, "nested"))).toBe(false);
  expect(readFileSync(protectedFile, "utf8")).toBe("outside bytes");
  expect(readlinkSync(ancestor)).toBe(outside);
});
