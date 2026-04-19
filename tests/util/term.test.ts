/**
 * Tests for src/util/term.ts — the color-decision + width primitives
 * used by every command that emits styled human output.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { colorEnabled, makeStyler, terminalWidth } from "../../src/util/term.ts";

describe("term", () => {
  const originalNoColor = process.env["NO_COLOR"];
  const originalIsTty = process.stdout.isTTY;
  const originalColumns = process.stdout.columns;

  beforeEach(() => {
    delete process.env["NO_COLOR"];
  });

  afterEach(() => {
    if (originalNoColor === undefined) delete process.env["NO_COLOR"];
    else process.env["NO_COLOR"] = originalNoColor;
    // `isTTY` and `columns` are normally read-only from user code, but
    // Node lets them be reassigned on WriteStream instances in practice.
    // Restoring them keeps cross-test state clean.
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalIsTty,
    });
    Object.defineProperty(process.stdout, "columns", {
      configurable: true,
      value: originalColumns,
    });
  });

  test("colorEnabled is false when NO_COLOR is set (any value)", () => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    process.env["NO_COLOR"] = "1";
    expect(colorEnabled()).toBe(false);
    process.env["NO_COLOR"] = "";
    expect(colorEnabled()).toBe(false);
  });

  test("colorEnabled is false when stdout is not a TTY", () => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    expect(colorEnabled()).toBe(false);
  });

  test("colorEnabled is true when TTY and NO_COLOR unset", () => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    expect(colorEnabled()).toBe(true);
  });

  test("makeStyler returns distinct stylers", () => {
    expect(makeStyler(false).bold("x")).toBe("x");
    expect(makeStyler(true).bold("x")).not.toBe("x");
  });

  test("terminalWidth falls back to 80 when columns is undefined", () => {
    Object.defineProperty(process.stdout, "columns", { configurable: true, value: undefined });
    expect(terminalWidth()).toBe(80);
  });

  test("terminalWidth returns actual columns when set", () => {
    Object.defineProperty(process.stdout, "columns", { configurable: true, value: 120 });
    expect(terminalWidth()).toBe(120);
  });
});
