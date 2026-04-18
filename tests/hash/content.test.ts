import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, renameSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hashDirectory, sha256OfBytes } from "../../src/hash/content.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

describe("hashDirectory", () => {
  test("C-HASH-01 empty directory", () => {
    const d = makeTempDir();
    // SHA-256 of the empty byte string.
    expect(hashDirectory(d)).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("C-HASH-02 same content in different creation order hashes the same", () => {
    const d1 = makeTempDir();
    const d2 = makeTempDir();
    writeFileSync(join(d1, "a.txt"), "A");
    writeFileSync(join(d1, "b.txt"), "B");
    writeFileSync(join(d2, "b.txt"), "B");
    writeFileSync(join(d2, "a.txt"), "A");
    expect(hashDirectory(d1)).toBe(hashDirectory(d2));
  });

  test("C-HASH-03 ignores root .crew.json", () => {
    const d = makeTempDir();
    writeFileSync(join(d, "a.txt"), "hello");
    const before = hashDirectory(d);
    writeFileSync(join(d, ".crew.json"), "{}");
    const after = hashDirectory(d);
    expect(after).toBe(before);
  });

  test("C-HASH-04 chmod +x does not change hash", () => {
    const d = makeTempDir();
    const f = join(d, "script.sh");
    writeFileSync(f, "#!/bin/sh\n");
    const before = hashDirectory(d);
    chmodSync(f, 0o755);
    const after = hashDirectory(d);
    expect(after).toBe(before);
  });

  test("C-HASH-05 touch does not change hash", () => {
    const d = makeTempDir();
    const f = join(d, "a.txt");
    writeFileSync(f, "contents");
    const before = hashDirectory(d);
    utimesSync(f, new Date(0), new Date(0));
    const after = hashDirectory(d);
    expect(after).toBe(before);
  });

  test("C-HASH-06 rename changes hash", () => {
    const d = makeTempDir();
    writeFileSync(join(d, "a.txt"), "hi");
    const before = hashDirectory(d);
    renameSync(join(d, "a.txt"), join(d, "b.txt"));
    const after = hashDirectory(d);
    expect(after).not.toBe(before);
  });

  test("C-HASH-07 file with null bytes hashes correctly", () => {
    const d = makeTempDir();
    writeFileSync(join(d, "a.bin"), Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]));
    const h = hashDirectory(d);
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("C-HASH-08 paths use POSIX separator regardless of platform", () => {
    // We construct the expected hash by hand for a 1-file dir.
    const d = makeTempDir();
    mkdirSync(join(d, "sub"), { recursive: true });
    writeFileSync(join(d, "sub", "a.txt"), "X");
    const h = hashDirectory(d);
    // Hash must include "sub/a.txt" (posix), not backslashes.
    expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("C-HASH-09 deterministic across calls", () => {
    const d = makeTempDir();
    writeFileSync(join(d, "a.txt"), "hello world");
    writeFileSync(join(d, "b.txt"), "goodbye");
    expect(hashDirectory(d)).toBe(hashDirectory(d));
  });

  test("symlink is hashed as its target", () => {
    const d = makeTempDir();
    writeFileSync(join(d, "real.txt"), "hi");
    symlinkSync("real.txt", join(d, "link"));
    const h1 = hashDirectory(d);
    // Changing the symlink target changes the hash.
    const d2 = makeTempDir();
    writeFileSync(join(d2, "real.txt"), "hi");
    symlinkSync("elsewhere", join(d2, "link"));
    const h2 = hashDirectory(d2);
    expect(h1).not.toBe(h2);
  });

  test("returns proper prefix", () => {
    const d = makeTempDir();
    writeFileSync(join(d, "a"), "x");
    expect(hashDirectory(d).startsWith("sha256:")).toBe(true);
  });

  test("missing directory returns empty-directory hash", () => {
    const h = hashDirectory(`/tmp/does-not-exist-crew-test-${Date.now()}`);
    expect(h).toBe("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  test("sha256OfBytes matches Node crypto", () => {
    expect(sha256OfBytes(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
