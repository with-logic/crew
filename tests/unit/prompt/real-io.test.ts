/**
 * defaultPrompt through the real IO seam (§5.4): stdin/stdout wiring and read
 * failures.
 */

import { describe, expect, test } from "bun:test";
import { defaultPrompt, realIO } from "../../../src/cli/prompt.ts";

describe("defaultPrompt real IO seam", () => {
  // These tests drive each `realIO` method in isolation — we don't
  // call `defaultPrompt()` without a stub IO, because that would
  // invoke `readSync(0, ...)` on the real stdin and block when the
  // suite is run from an interactive terminal.

  test("realIO.isTTY mirrors process.stdin.isTTY", () => {
    const orig = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
    try {
      expect(realIO.isTTY()).toBe(true);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: orig, configurable: true });
    }
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      expect(realIO.isTTY()).toBe(false);
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: orig, configurable: true });
    }
  });

  test("realIO.writeStderr writes to process.stderr", () => {
    const origWrite = process.stderr.write.bind(process.stderr);
    let captured = "";
    (process.stderr as { write: (s: string) => boolean }).write = (s: string) => {
      captured += s;
      return true;
    };
    try {
      realIO.writeStderr("hello ");
      expect(captured).toBe("hello ");
    } finally {
      (process.stderr as { write: (s: string) => boolean }).write = origWrite as unknown as (
        s: string,
      ) => boolean;
    }
  });

  test("realIO.readByte reads from the given fd (EOF on an empty file)", () => {
    const { openSync, closeSync, writeFileSync, mkdtempSync } =
      require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const { tmpdir } = require("node:os") as typeof import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "crew-prompt-"));
    const empty = join(dir, "empty");
    writeFileSync(empty, "");
    const fd = openSync(empty, "r");
    try {
      const buf = Buffer.alloc(1);
      expect(realIO.readByte(buf, fd)).toBe(0);
    } finally {
      closeSync(fd);
    }
    const withByte = join(dir, "one");
    writeFileSync(withByte, "y");
    const fd2 = openSync(withByte, "r");
    try {
      const buf = Buffer.alloc(1);
      expect(realIO.readByte(buf, fd2)).toBe(1);
      expect(buf.toString("utf8", 0, 1)).toBe("y");
    } finally {
      closeSync(fd2);
    }
  });

  test("defaultPrompt with realIO short-circuits to abort when stdin is not a TTY", () => {
    const orig = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    try {
      // isTTY: false → returns abort immediately without calling readByte.
      // Safe to run against the real realIO because no read happens.
      expect(defaultPrompt("nope", realIO)).toBe("abort");
    } finally {
      Object.defineProperty(process.stdin, "isTTY", { value: orig, configurable: true });
    }
  });
});
