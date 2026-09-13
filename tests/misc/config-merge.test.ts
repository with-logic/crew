/**
 * Direct tests for the resolver/config reconciliation helpers (§14, §16.5).
 *
 * Resolution runs BEFORE the state lock, so `runInstall` holds a config
 * snapshot that a concurrent `crew tap remove` (or remove + re-add) can
 * invalidate. These are the two helpers that keep the locked section
 * honest, exercised here at the unit level because the interleaving they
 * defend against is what a second process does between two statements —
 * constructing it end-to-end would mean racing a real subprocess.
 */

import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../../src/config/defaults.ts";
import type { CrewError } from "../../src/core/errors.ts";
import type { Config, ResolvedSkill, TapConfig } from "../../src/core/types.ts";
import { assertTapsPresent, mergeAutoTaps } from "../../src/install/config-merge.ts";

function gitTap(name: string, url: string, registered = true): TapConfig {
  return { name, kind: "git", registered, url, subpath: "", path: "" };
}

function configWith(taps: TapConfig[]): Config {
  return { ...defaultConfig(), taps };
}

function skillFrom(tap: TapConfig, name = "alpha"): ResolvedSkill {
  return { name, tap } as ResolvedSkill;
}

/** Run `fn`, returning the CrewError it threw, or null if it returned. */
function caught(fn: () => void): CrewError | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err as CrewError;
  }
}

describe("mergeAutoTaps", () => {
  test("keeps only the taps the resolver actually added", () => {
    const before = configWith([gitTap("core", "https://example.test/core.git")]);
    const auto = gitTap("auto", "https://example.test/auto.git", false);
    const extended = configWith([...before.taps, auto]);
    // Fresh config gained an unrelated tap while resolution ran.
    const other = gitTap("other", "https://example.test/other.git");
    const fresh = configWith([...before.taps, other]);

    const merged = mergeAutoTaps(fresh, before, extended);

    expect(merged.taps.map((t) => t.name).sort()).toEqual(["auto", "core", "other"]);
  });

  test("a tap removed during resolution is NOT resurrected", () => {
    const removed = gitTap("mytap", "https://example.test/mytap.git");
    const before = configWith([gitTap("core", "https://example.test/core.git"), removed]);
    const auto = gitTap("auto", "https://example.test/auto.git", false);
    const extended = configWith([...before.taps, auto]);
    // The concurrent `crew tap remove mytap` landed before the lock.
    const fresh = configWith([gitTap("core", "https://example.test/core.git")]);

    const merged = mergeAutoTaps(fresh, before, extended);

    // `auto` is genuinely new and comes along; `mytap` stays removed.
    expect(merged.taps.map((t) => t.name).sort()).toEqual(["auto", "core"]);
  });

  test("returns fresh config untouched when the resolver added nothing", () => {
    const before = configWith([gitTap("core", "https://example.test/core.git")]);
    const fresh = configWith([gitTap("core", "https://example.test/core.git")]);

    // Same object identity back: no taps to splice in, so no new array.
    expect(mergeAutoTaps(fresh, before, before)).toBe(fresh);
  });
});

describe("assertTapsPresent", () => {
  test("passes when the tap is still bound to the same source", () => {
    const tap = gitTap("mytap", "https://example.test/a.git");
    expect(caught(() => assertTapsPresent(configWith([tap]), [skillFrom(tap)]))).toBe(null);
  });

  test("rejects a tap that disappeared during resolution", () => {
    const tap = gitTap("mytap", "https://example.test/a.git");
    const err = caught(() => assertTapsPresent(configWith([]), [skillFrom(tap)]));

    expect(err?.code).toBe("source_unreachable");
    expect(err?.message).toContain("was removed");
    expect(err?.details["tap"]).toBe("mytap");
  });

  test("rejects a tap NAME rebound to a different source", () => {
    // A concurrent `tap remove mytap` + `tap add <other-url> mytap` keeps
    // the name but changes what it means. State records skills by tap
    // name, so installing A's bytes would attribute them to B.
    const resolvedFrom = gitTap("mytap", "https://example.test/a.git");
    const nowBoundTo = gitTap("mytap", "https://example.test/b.git");

    const err = caught(() =>
      assertTapsPresent(configWith([nowBoundTo]), [skillFrom(resolvedFrom)]),
    );

    expect(err?.code).toBe("source_unreachable");
    expect(err?.message).toContain("was replaced");
    expect(err?.details["skill"]).toBe("alpha");
  });

  test("rejects a rebind that only changes the subpath", () => {
    // Same repo, different directory inside it: still different bytes.
    const resolvedFrom = gitTap("mytap", "https://example.test/a.git");
    const nowBoundTo: TapConfig = { ...resolvedFrom, subpath: "skills" };

    const err = caught(() =>
      assertTapsPresent(configWith([nowBoundTo]), [skillFrom(resolvedFrom)]),
    );

    expect(err?.code).toBe("source_unreachable");
    expect(err?.message).toContain("was replaced");
  });

  test("rejects a git tap replaced by a path tap of the same name", () => {
    const resolvedFrom = gitTap("mytap", "https://example.test/a.git");
    const nowBoundTo: TapConfig = {
      name: "mytap",
      kind: "path",
      registered: true,
      url: "",
      subpath: "",
      path: "/tmp/mytap",
    };

    const err = caught(() =>
      assertTapsPresent(configWith([nowBoundTo]), [skillFrom(resolvedFrom)]),
    );

    expect(err?.code).toBe("source_unreachable");
  });
});
