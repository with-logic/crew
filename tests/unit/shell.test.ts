/**
 * Unit tests for shell quoting of printed commands (§13, C-TAP-24e).
 */

import { describe, expect, test } from "bun:test";
import { shellQuote } from "../../src/util/shell.ts";

describe("shellQuote", () => {
  test("leaves ordinary references alone", () => {
    // Quoting everything would make every printed command noisy.
    expect(shellQuote("anthropic/pdf")).toBe("anthropic/pdf");
    expect(shellQuote("anthropic/pdf@v1.2.0")).toBe("anthropic/pdf@v1.2.0");
    expect(shellQuote("./local-skill")).toBe("./local-skill");
  });

  test("quotes anything a shell would interpret", () => {
    expect(shellQuote("pdf@$(id)")).toBe("'pdf@$(id)'");
    expect(shellQuote("pdf@`id`")).toBe("'pdf@`id`'");
    expect(shellQuote("pdf@a;rm")).toBe("'pdf@a;rm'");
    expect(shellQuote("pdf@a|b")).toBe("'pdf@a|b'");
    expect(shellQuote("pdf@a&&b")).toBe("'pdf@a&&b'");
    expect(shellQuote("has space")).toBe("'has space'");
  });

  test("carries a literal single quote through", () => {
    // Close, escape, reopen — the only POSIX way, since single quotes
    // have no escape sequence inside single quotes.
    expect(shellQuote("pdf@v1'x")).toBe(`'pdf@v1'\\''x'`);
  });

  test("quotes the empty string", () => {
    // Bare, it would vanish from the command rather than being an
    // empty argument.
    expect(shellQuote("")).toBe("''");
  });
});
