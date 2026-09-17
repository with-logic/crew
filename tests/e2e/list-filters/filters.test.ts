/**
 * `crew list --agent` / `--tap` row filtering (§5.1 "`crew list` agent
 * and tap filters"). Covers C-LIST-04..05: each filter narrows rows and
 * reports itself in the JSON payload, and an unknown name is a usage
 * error rather than a quietly empty list.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { makeCrewHome } from "../../helpers/env.ts";
import { json, redirectAdapters, run, seed } from "./helpers.ts";

let restoreAdapters: () => void = () => {};
beforeEach(() => {
  restoreAdapters = redirectAdapters();
});
afterEach(() => {
  restoreAdapters();
});

describe("crew list --agent / --tap", () => {
  test("C-LIST-04 --agent keeps rows installed into that agent and reports the filter", () => {
    const home = makeCrewHome();
    seed(home);
    const codex = json(home, "--agent", "codex");
    // `gamma` is a codex install at project scope; unscoped list shows both scopes.
    expect(codex.installations.map((e) => e.name).sort()).toEqual(["alpha", "beta", "gamma"]);
    expect(codex.agent).toEqual(["codex"]);
    const cc = json(home, "--agent", "claude-code");
    expect(cc.installations.map((e) => e.name)).toEqual(["alpha"]);
    // Filter selects rows; it doesn't hide the row's full agent list.
    expect([...cc.installations[0]!.agents].sort()).toEqual(["claude-code", "codex"]);
    const human = run(home, "--agent", "claude-code");
    expect(human.out).toContain("alpha");
    expect(human.out).not.toContain("beta");
    expect(human.out).toContain("claude-code, codex");
    expect(json(home).agent).toEqual([]);
  });

  test("C-LIST-04 --agent is repeatable (any-of)", () => {
    const home = makeCrewHome();
    seed(home);
    const both = json(home, "--agent", "claude-code", "--agent", "codex");
    expect(both.installations.map((e) => e.name).sort()).toEqual(["alpha", "beta", "gamma"]);
    expect(both.agent).toEqual(["claude-code", "codex"]);
  });

  test("C-LIST-04 an unknown agent is a usage_error naming the known agents", () => {
    const home = makeCrewHome();
    seed(home);
    const r = run(home, "--agent", "nope");
    expect(r.code).toBe(4);
    expect(r.err).toContain("unknown agent: nope");
    expect(r.err).toContain("claude-code");
  });

  test("C-LIST-05 --tap keeps rows attributed to that tap and reports the filter", () => {
    const home = makeCrewHome();
    seed(home);
    const all = json(home);
    const betaTap = all.installations.find((e) => e.name === "beta")!.source.tap;
    const filtered = json(home, "--tap", betaTap);
    expect(filtered.installations.map((e) => e.name)).toEqual(["beta"]);
    expect(filtered.tap).toBe(betaTap);
    expect(all.tap).toBeNull();
    const human = run(home, "--tap", betaTap);
    expect(human.out).toContain("beta");
    expect(human.out).not.toContain("alpha");
  });

  test("C-LIST-05 an unknown tap is a usage_error pointing at crew tap list", () => {
    const home = makeCrewHome();
    seed(home);
    const r = run(home, "--tap", "nope");
    expect(r.code).toBe(4);
    expect(r.err).toContain("`nope` was not found in your list of taps");
    expect(r.err).toContain("crew tap list");
  });

  test("C-LIST-05 a repeated --tap is a usage_error, not a silent unfiltered list", () => {
    const home = makeCrewHome();
    seed(home);
    const tap = json(home).installations[0]!.source.tap;
    // Repeating a single-value flag used to yield an array, which
    // `extras` dropped — so the filter silently vanished and neither
    // value was validated. Failing loudly is the only safe behaviour.
    const r = run(home, "--tap", tap, "--tap", "typo");
    expect(r.code).toBe(4);
    expect(r.err).toContain("`--tap` was given more than once");
  });
});
