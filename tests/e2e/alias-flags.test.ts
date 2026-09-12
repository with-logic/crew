/**
 * Alias flag fidelity (PRD §5.1, §5.5).
 *
 * Two invariants that drifted and were caught in review:
 *
 *   1. A bare alias (`rm` → `uninstall`) accepts, and documents, every
 *      flag its canonical command accepts. `remove`/`rm` had listed two
 *      of uninstall's four; `ls` one of list's two.
 *   2. A prefixed alias (`taps` → `tap list`) names one subcommand, so
 *      it must NOT inherit the canonical command's whole flag table.
 *      `crew taps --recursive` parsed once aliases were canonicalized
 *      for flag lookup, and was only caught by a later runtime guard.
 */

import { describe, expect, test } from "bun:test";
import { COMMAND_ALIASES } from "../../src/cli/aliases.ts";
import { runCli } from "../../src/cli/main.ts";
import { helpFor } from "../../src/commands/help/content/index.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

/**
 * Bare aliases, paired with the canonical command whose flags they
 * share — derived from `COMMAND_ALIASES` so a new alias is covered
 * automatically instead of needing to be remembered here. Prefixed
 * aliases (`taps` -> `tap list`) are excluded: they name one
 * subcommand and deliberately do not inherit the whole flag table.
 */
const BARE_ALIASES: readonly (readonly [string, string])[] = Object.entries(COMMAND_ALIASES)
  .filter(([, target]) => target.length === 1)
  .map(([alias, target]) => [alias, target[0]!] as const);

describe("alias help lists the canonical flags", () => {
  for (const [alias, canonical] of BARE_ALIASES) {
    test(`C-CLI-01b crew ${alias} documents every crew ${canonical} flag`, () => {
      const aliasFlags = helpFor(alias)?.flags;
      const canonicalFlags = helpFor(canonical)?.flags;
      expect(canonicalFlags).toBeDefined();
      expect(aliasFlags).toEqual(canonicalFlags);
    });
  }

  test("C-CLI-01b rendered `crew help remove` shows all four uninstall flags", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    expect(runCli(["help", "remove"], { home, streams: c.streams })).toBe(0);
    const out = c.stdout();
    expect(out).toContain("--scope");
    expect(out).toContain("--agent");
    expect(out).toContain("--prune");
    expect(out).toContain("--force");
  });

  test("C-CLI-01b rendered `crew help ls` shows list's --scope", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    expect(runCli(["help", "ls"], { home, streams: c.streams })).toBe(0);
    expect(c.stdout()).toContain("--scope");
  });
});

describe("prefixed aliases stay strict", () => {
  for (const argv of [
    ["taps", "--recursive"],
    ["untap", "--recursive", "some-tap"],
  ]) {
    test(`C-CLI-01b crew ${argv.join(" ")} is rejected by the parser`, () => {
      const home = makeCrewHome();
      const c = captureStreams();
      const code = runCli(argv, { home, streams: c.streams });
      expect(code).toBe(4);
      expect(c.stderr()).toContain("Unknown argument: recursive");
    });
  }

  test("C-CLI-01b bare aliases still accept the canonical command's flags", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    // `--prune` belongs to uninstall. Reaching not_installed_here rather
    // than a parse error proves the flag was accepted.
    const code = runCli(["rm", "--prune", "nothing-here"], { home, streams: c.streams });
    expect(code).toBe(6);
    expect(c.stderr()).not.toContain("Unknown argument");
  });
});
