/** Source hashing classifies acquired-source reads and preserves traversal policies (§9, §12.1, §13). */

import { expect, test } from "bun:test";
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashDirectory } from "../../src/hash/content.ts";
import { hashSourceDirectory } from "../../src/sources/read.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

test("source hashing identifies the unreadable file and gives a local remedy", () => {
  const source = makeTempDir();
  const file = join(source, "asset.txt");
  writeFileSync(file, "bytes");
  chmodSync(file, 0);
  try {
    expect(() => hashSourceDirectory(source)).toThrow(
      expect.objectContaining({
        code: "source_unreachable",
        details: { path: file },
        remedy: expect.stringContaining("source file"),
      }),
    );
    expect(() => hashDirectory(source)).toThrow(expect.objectContaining({ code: "EACCES" }));
  } finally {
    chmodSync(file, 0o600);
  }
});

for (const mode of [0o100, 0o400]) {
  test(`source hashing normalizes directory permission failures (${mode.toString(8)})`, () => {
    const source = makeTempDir();
    writeFileSync(join(source, "asset.txt"), "bytes");
    chmodSync(source, mode);
    try {
      expect(() => hashSourceDirectory(source)).toThrow(
        expect.objectContaining({
          code: "source_unreachable",
          details: { path: mode === 0o100 ? source : join(source, "asset.txt") },
          remedy: expect.stringContaining("source directory"),
        }),
      );
      expect(() => hashDirectory(source)).toThrow(expect.objectContaining({ code: "EACCES" }));
    } finally {
      chmodSync(source, 0o700);
    }
  });
}

test("source hashing preserves hash bytes and never follows symlink targets", () => {
  const source = makeTempDir();
  const file = join(source, "asset.txt");
  writeFileSync(file, "bytes");
  const external = join(makeTempDir(), "external.txt");
  writeFileSync(external, "unreadable target");
  symlinkSync(external, join(source, "link"));
  chmodSync(external, 0);
  try {
    expect(hashSourceDirectory(source)).toBe(hashDirectory(source));
  } finally {
    chmodSync(external, 0o600);
  }
});
