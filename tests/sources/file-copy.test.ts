/** Direct source-file copies distinguish readable sources from write errors (§9, §13). */
import { expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { copySourceFile } from "../../src/sources/read.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

test("a source-file copy keeps an unwritable destination's native copyfile failure", () => {
  const source = join(makeTempDir(), "source.md");
  const destination = join(makeTempDir(), "SKILL.md");
  writeFileSync(source, "source bytes");
  writeFileSync(destination, "previous bytes");
  chmodSync(destination, 0o400);
  try {
    expect(() => copySourceFile(source, destination)).toThrow(
      expect.objectContaining({ code: "EACCES", syscall: "copyfile" }),
    );
    expect(readFileSync(destination, "utf8")).toBe("previous bytes");
  } finally {
    chmodSync(destination, 0o600);
  }
});

test("a source-file copy keeps a missing destination parent's native error", () => {
  const source = join(makeTempDir(), "source.md");
  writeFileSync(source, "source bytes");
  const destination = join(makeTempDir(), "absent", "SKILL.md");
  expect(() => copySourceFile(source, destination)).toThrow(
    expect.objectContaining({ code: "ENOENT", syscall: "copyfile" }),
  );
});
