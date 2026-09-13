/**
 * Suggested commands are instructions, so what crew prints must survive
 * a paste (§13 "human-mode error quality").
 *
 * A skill reference can carry an `@<ref>` tail, and §8.4 constrains a
 * git-ref only to "no whitespace, no slash" — `$(…)`, backticks, `;`,
 * and `&&` are all legal. Interpolated unquoted into a copy-pasteable
 * `crew install …`, that ref is whatever the shell makes of it. These
 * tests pin that every printed command quotes the reference, on both
 * the human and the `--json` surface.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { resetKnownTapsForTest, setKnownTapsForTest } from "../../src/known-taps/registry.ts";
import type { KnownTap } from "../../src/known-taps/types.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

const KNOWN_TAPS: readonly KnownTap[] = [
  {
    name: "anthropic",
    url: "https://github.com/anthropics/skills.git",
    subpath: "skills",
    description: "Anthropic's skills.",
    trust: "official",
    skills: [{ name: "pdf", namespace: null, description: "PDF work.", path: "pdf" }],
  },
];

afterEach(() => {
  resetKnownTapsForTest();
});

function bareHome(): string {
  const home = makeCrewHome();
  setKnownTapsForTest(KNOWN_TAPS);
  const setup = captureStreams();
  runCli(["tap", "remove", "core", "--force"], { home, streams: setup.streams });
  return home;
}

describe("suggested command safety", () => {
  test("C-TAP-24e a shell-metacharacter ref is quoted in the printed command", () => {
    const home = bareHome();
    const c = captureStreams();
    const code = runCli(["install", "pdf@$(id)"], { home, streams: c.streams });

    expect(code).toBe(4);
    // The command line must carry the ref as one literal argument.
    expect(c.stderr()).toContain("crew install 'anthropic/pdf@$(id)'");
    // And must never present it as bare, pasteable syntax.
    expect(c.stderr()).not.toContain("crew install anthropic/pdf@$(id)");
  });

  test("C-TAP-24e the JSON install command is quoted too", () => {
    const home = bareHome();
    const c = captureStreams();
    runCli(["install", "--json", "pdf@`id`"], { home, streams: c.streams });

    const parsed = JSON.parse(c.stdout()) as {
      error: { details: { known_tap_suggestions: { install: string }[] } };
    };
    const commands = parsed.error.details.known_tap_suggestions.map((s) => s.install);
    expect(commands).toEqual(["crew install 'anthropic/pdf@`id`'"]);
  });

  test("C-TAP-24e a single quote inside the ref stays inside one argument", () => {
    const home = bareHome();
    const c = captureStreams();
    runCli(["install", "--json", "pdf@v1'x"], { home, streams: c.streams });

    const parsed = JSON.parse(c.stdout()) as {
      error: { details: { known_tap_suggestions: { install: string }[] } };
    };
    // close, escape, reopen — the POSIX way to carry a literal quote.
    expect(parsed.error.details.known_tap_suggestions[0]?.install).toBe(
      `crew install 'anthropic/pdf@v1'\\''x'`,
    );
  });

  test("C-TAP-24e an ordinary ref is left unquoted", () => {
    const home = bareHome();
    const c = captureStreams();
    runCli(["install", "pdf@v1.2.0"], { home, streams: c.streams });

    // Quoting every suggestion would be noise; only unsafe ones need it.
    expect(c.stderr()).toContain("crew install anthropic/pdf@v1.2.0");
  });
});
