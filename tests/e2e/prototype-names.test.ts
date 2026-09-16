/**
 * Prototype-named words take the normal not-found paths (§5.1, §5.5).
 *
 * Crew keys its command, alias, help, and flag registries by a word
 * taken straight from argv. A plain object resolves inherited members,
 * so before `src/util/registry.ts` guarded these lookups, `crew
 * __proto__` retrieved a prototype value and was treated as a real
 * entry — surfacing as "crew hit an unexpected error" with a
 * bug-report link instead of the ordinary unknown-command message.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";

/** Inherited members of every plain object literal. */
const PROTOTYPE_NAMES = ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"];

describe("prototype-named commands", () => {
  for (const name of PROTOTYPE_NAMES) {
    test(`C-CLI-01 \`crew ${name}\` is an ordinary unknown command`, () => {
      const home = makeCrewHome();
      const c = captureStreams();
      const code = runCli([name], { home, streams: c.streams });

      expect(code).toBe(4);
      expect(c.stderr()).toContain(`\`${name}\` is not a crew command.`);
      // The tell for the old bug: an internal error, not a usage message.
      expect(c.stderr()).not.toContain("unexpected error");
      expect(c.stderr()).not.toContain("report this at");
    });
  }

  test("C-CLI-01 a prototype-named command with flags still reports cleanly", () => {
    // Flag tables are keyed the same way, so the parser must not splice
    // a prototype value into its flag list before dispatch is reached.
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["constructor", "--json"], { home, streams: c.streams });

    expect(code).toBe(4);
    expect(JSON.parse(c.stdout()).error.name).toBe("usage_error");
  });
});

describe("prototype-named help targets", () => {
  for (const name of PROTOTYPE_NAMES) {
    test(`C-CLI-03 \`crew help ${name}\` falls back to the overview`, () => {
      const home = makeCrewHome();
      const c = captureStreams();
      const code = runCli(["help", name], { home, streams: c.streams });

      // §5.5: an unknown help target shows the overview and exits 0.
      expect(code).toBe(0);
      expect(c.stdout()).toContain("GETTING STARTED");
      expect(c.stderr()).not.toContain("unexpected error");
    });
  }

  test("C-CLI-03 a prototype-named help target emits structured overview JSON", () => {
    const home = makeCrewHome();
    const c = captureStreams();
    const code = runCli(["help", "__proto__", "--json"], { home, streams: c.streams });

    expect(code).toBe(0);
    const payload = JSON.parse(c.stdout());
    expect(Array.isArray(payload.commands)).toBe(true);
  });
});
