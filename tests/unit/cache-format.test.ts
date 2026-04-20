/**
 * Unit tests for the byte-count formatter used by `crew cache clean`.
 */

import { describe, expect, test } from "bun:test";
import { formatBytes } from "../../src/commands/cache.ts";

describe("formatBytes", () => {
  test("under 1 KB is bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  test("KB range — one decimal under 10 KB, rounded otherwise", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1024 * 42)).toBe("42 KB");
  });

  test("MB range", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1024 * 1024 * 25)).toBe("25 MB");
  });

  test("GB range", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatBytes(1024 * 1024 * 1024 * 12)).toBe("12 GB");
  });
});
