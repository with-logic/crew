/** File-mode staging keeps raw bytes and source/write failure boundaries (§9, §13). */
import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stageIntoStore } from "../../../src/sources/store.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

function sourceFile(): string {
  const file = join(makeTempDir(), "arbitrary.md");
  writeFileSync(file, Buffer.from([0, 255, 13, 10, 128, 1]));
  return file;
}

test("C-GIST-01 file staging copies exactly the original bytes", () => {
  const source = sourceFile();
  const stored = stageIntoStore(
    source,
    "selected",
    "a".repeat(40),
    makeCrewHome(),
    undefined,
    true,
  );
  expect(readFileSync(join(stored.storePath, "SKILL.md"))).toEqual(readFileSync(source));
});

test("C-GIST-01 file staging identifies an unreadable source file", () => {
  const source = sourceFile();
  const home = makeCrewHome();
  chmodSync(source, 0);
  try {
    expect(() => stageIntoStore(source, "selected", "a".repeat(40), home, undefined, true)).toThrow(
      expect.objectContaining({
        code: "source_unreachable",
        details: { path: source },
        remedy: expect.stringContaining("source file"),
      }),
    );
  } finally {
    chmodSync(source, 0o600);
  }
  expect(readdirSync(join(home, "store"))).toEqual([]);
});

test("C-GIST-01 file staging retains native destination failures", () => {
  const source = sourceFile();
  const home = makeCrewHome();
  chmodSync(home, 0o500);
  try {
    expect(() => stageIntoStore(source, "selected", "a".repeat(40), home, undefined, true)).toThrow(
      expect.objectContaining({ code: "EACCES" }),
    );
  } finally {
    chmodSync(home, 0o700);
  }
});

test("C-INST-23 rejected gist file type releases its private staging", () => {
  const source = join(makeTempDir(), "became-directory");
  mkdirSync(source);
  const home = makeCrewHome();
  expect(() => stageIntoStore(source, "selected", "a".repeat(40), home, undefined, true)).toThrow(
    expect.objectContaining({ code: "invalid_skill", details: { path: source } }),
  );
  expect(readdirSync(join(home, "store"))).toEqual([]);
  expect(readdirSync(source)).toEqual([]);
});
