/** Explicit copy destination boundaries and trusted configured aliases (§7.3, §12.1). */

import { describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../../src/core/errors.ts";
import { hashDirectory } from "../../../src/hash/content.ts";
import { copyTree } from "../../../src/util/copy.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

describe("copy destination boundary", () => {
  test.each([true, false])(
    "rejects an ancestor link with nested destination present=%s",
    (present) => {
      const root = makeTempDir("crew-copy-boundary-");
      try {
        const src = join(root, "source");
        const base = join(root, "destination");
        const outside = join(root, "outside");
        for (const dir of [src, base, outside]) mkdirSync(dir);
        writeFileSync(join(src, "payload"), "replacement");
        const nested = join(outside, "nested");
        if (present) mkdirSync(nested);
        const sentinel = join(present ? nested : outside, "payload");
        writeFileSync(sentinel, "keep outside bytes");
        const link = join(base, "ancestor");
        symlinkSync(outside, link);
        let error: unknown;
        try {
          copyTree(src, join(link, "nested"), { destinationRoot: base });
        } catch (caught) {
          error = caught;
        }
        expect(error).toBeInstanceOf(CrewError);
        expect(error).toMatchObject({ code: "usage_error" });
        expect(readFileSync(sentinel, "utf8")).toBe("keep outside bytes");
        if (!present) expect(existsSync(nested)).toBe(false);
        expect(readlinkSync(link)).toBe(outside);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  test("creates a missing safe nested destination, preserving source links and hash bytes", () => {
    const root = makeTempDir("crew-copy-boundary-");
    try {
      const src = join(root, "source");
      const base = join(root, "destination");
      mkdirSync(src);
      writeFileSync(join(src, "payload"), "source bytes");
      writeFileSync(join(src, ".crew.json"), "source-authored marker");
      symlinkSync("payload", join(src, "link"));
      const dest = join(base, "missing", "nested");
      copyTree(src, dest, { destinationRoot: base });
      expect(readFileSync(join(dest, "payload"), "utf8")).toBe("source bytes");
      expect(lstatSync(join(dest, "link")).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(dest, "link"))).toBe("payload");
      expect(existsSync(join(dest, ".crew.json"))).toBe(false);
      expect(hashDirectory(dest)).toBe(hashDirectory(src));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test.each(["at", "above"])("supports an alias %s the trusted base", (position) => {
    const root = makeTempDir("crew-copy-boundary-");
    try {
      const src = join(root, "source");
      const actual = join(root, "actual");
      mkdirSync(src);
      mkdirSync(join(actual, "base"), { recursive: true });
      writeFileSync(join(src, "payload"), "source bytes");
      const alias = join(root, "alias");
      symlinkSync(actual, alias);
      const base = position === "at" ? alias : join(alias, "base");
      copyTree(src, join(base, "nested"), { destinationRoot: base });
      expect(readFileSync(join(base, "nested", "payload"), "utf8")).toBe("source bytes");
      expect(lstatSync(alias).isSymbolicLink()).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test.each(["destination-sibling", "."])("rejects a lexical escape to %s", (name) => {
    const root = makeTempDir("crew-copy-boundary-");
    try {
      const src = join(root, "source");
      const base = join(root, "destination");
      const dest = join(base, "..", name);
      mkdirSync(src);
      writeFileSync(join(src, "payload"), "source bytes");
      let error: unknown;
      try {
        copyTree(src, dest, { destinationRoot: base });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(CrewError);
      expect(error).toMatchObject({ code: "usage_error" });
      expect(existsSync(join(dest, "payload"))).toBe(false);
      expect(existsSync(base)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a boundary equal to the destination still refuses its own symlink leaf", () => {
    const root = makeTempDir("crew-copy-boundary-");
    try {
      const src = join(root, "source");
      const outside = join(root, "outside");
      mkdirSync(src);
      mkdirSync(outside);
      writeFileSync(join(src, "payload"), "replacement");
      const dest = join(root, "link");
      symlinkSync(outside, dest);
      expect(() => copyTree(src, dest, { destinationRoot: dest })).toThrow(CrewError);
      expect(existsSync(join(outside, "payload"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
