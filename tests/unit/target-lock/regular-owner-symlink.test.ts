/** Advisory owner reads ignore links even when their referent is a valid regular record (§14). */
import { expect, test } from "bun:test";
import { readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readOwnerRecord } from "../../../src/util/owner-record.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

test("C-CONC-06 a symlink to a regular owner record is treated as absent", () => {
  const root = makeTempDir();
  const referent = join(root, "regular-owner");
  const linked = join(root, "linked-owner");
  const record = `${process.pid} 123 456`;
  writeFileSync(referent, record);
  symlinkSync(referent, linked);
  expect(readOwnerRecord(referent)).toBe(record);
  expect(readOwnerRecord(linked)).toBeUndefined();
  expect(readFileSync(referent, "utf8")).toBe(record);
});
