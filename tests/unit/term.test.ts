/**
 * Unit tests for the styler palette. Exercises both styler flavors:
 * the plain one (returns text unchanged, ASCII tokens for symbols) and
 * the ANSI one (wraps text with escape codes, Unicode glyphs).
 */

import { describe, expect, test } from "bun:test";
import { colorEnabled, makeStyler, terminalWidth } from "../../src/util/term.ts";

describe("plain styler", () => {
  const s = makeStyler(false);

  test("every color/weight method returns its input verbatim", () => {
    expect(s.bold("x")).toBe("x");
    expect(s.dim("x")).toBe("x");
    expect(s.italic("x")).toBe("x");
    expect(s.green("x")).toBe("x");
    expect(s.red("x")).toBe("x");
    expect(s.yellow("x")).toBe("x");
    expect(s.cyan("x")).toBe("x");
  });

  test("symbol() returns ASCII tokens so piped logs stay readable", () => {
    expect(s.symbol("ok")).toBe("[ok]");
    expect(s.symbol("fail")).toBe("[fail]");
    expect(s.symbol("warn")).toBe("[warn]");
    expect(s.symbol("muted")).toBe("-");
  });
});

describe("ansi styler", () => {
  const s = makeStyler(true);

  test("wraps each style in an escape-reset pair", () => {
    expect(s.bold("x")).toBe("\x1b[1mx\x1b[0m");
    expect(s.dim("x")).toBe("\x1b[2mx\x1b[0m");
    expect(s.italic("x")).toBe("\x1b[3mx\x1b[0m");
    expect(s.green("x")).toBe("\x1b[32mx\x1b[0m");
    expect(s.red("x")).toBe("\x1b[31mx\x1b[0m");
    expect(s.yellow("x")).toBe("\x1b[33mx\x1b[0m");
    expect(s.cyan("x")).toBe("\x1b[36mx\x1b[0m");
  });

  test("symbol() uses Unicode glyphs in an appropriate color", () => {
    expect(s.symbol("ok")).toBe("\x1b[32m✓\x1b[0m");
    expect(s.symbol("fail")).toBe("\x1b[31m✗\x1b[0m");
    expect(s.symbol("warn")).toBe("\x1b[33m⚠\x1b[0m");
    expect(s.symbol("muted")).toBe("\x1b[2m·\x1b[0m");
  });
});

describe("environment-sensitive helpers", () => {
  test("colorEnabled respects NO_COLOR", () => {
    const orig = process.env["NO_COLOR"];
    process.env["NO_COLOR"] = "1";
    try {
      expect(colorEnabled()).toBe(false);
    } finally {
      if (orig === undefined) {
        delete process.env["NO_COLOR"];
      } else {
        process.env["NO_COLOR"] = orig;
      }
    }
  });

  test("colorEnabled reads process.stdout.isTTY when NO_COLOR is unset", () => {
    const origNoColor = process.env["NO_COLOR"];
    delete process.env["NO_COLOR"];
    const origTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
    try {
      expect(colorEnabled()).toBe(true);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origTTY, configurable: true });
      if (origNoColor !== undefined) process.env["NO_COLOR"] = origNoColor;
    }
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
    try {
      expect(colorEnabled()).toBe(false);
    } finally {
      Object.defineProperty(process.stdout, "isTTY", { value: origTTY, configurable: true });
    }
  });

  test("terminalWidth reads process.stdout.columns, falling back to 80", () => {
    const orig = process.stdout.columns;
    Object.defineProperty(process.stdout, "columns", { value: 42, configurable: true });
    try {
      expect(terminalWidth()).toBe(42);
    } finally {
      Object.defineProperty(process.stdout, "columns", { value: orig, configurable: true });
    }
    Object.defineProperty(process.stdout, "columns", { value: undefined, configurable: true });
    try {
      expect(terminalWidth()).toBe(80);
    } finally {
      Object.defineProperty(process.stdout, "columns", { value: orig, configurable: true });
    }
  });
});
