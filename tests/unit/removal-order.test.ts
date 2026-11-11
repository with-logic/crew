/**
 * Removal order for dropped manifest entries (§9.2): dependents before
 * what they depend on, nothing that something staying still needs, and
 * cycles removed only as a whole.
 */
import { describe, expect, test } from "bun:test";
import { removalOrder } from "../../src/commands/install/manifest/removal/order.ts";
import type { StateEntry } from "../../src/core/types.ts";

/** A dropped entry named `name`, required by `requiredBy`. */
function entry(name: string, requiredBy: readonly string[] = []): StateEntry {
  return {
    name,
    source: { tap: "t", path: name },
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:0",
    scope: "project",
    project_root: "/work/app",
    installed_at: "2026-01-01T00:00:00Z",
    agents: ["claude-code"],
    pinned: false,
    explicit: false,
    required_by: requiredBy,
    manifest_owned: true,
  };
}

/** The order for `entries`, with the names in `staying` decided as kept. */
function order(entries: readonly StateEntry[], staying: readonly string[] = []): string[] {
  return removalOrder(entries, new Set(staying));
}

describe("removalOrder", () => {
  test("nothing dropped removes nothing", () => {
    expect(order([])).toEqual([]);
  });

  test("independent entries are all removed", () => {
    expect(order([entry("a"), entry("b")]).sort()).toEqual(["a", "b"]);
  });

  test("a chain is removed dependents first", () => {
    const chain = [entry("base", ["middle"]), entry("middle", ["top"]), entry("top")];
    expect(order(chain)).toEqual(["top", "middle", "base"]);
  });

  test("a dependency shared by two dependents comes after both, exactly once", () => {
    const removed = order([entry("base", ["left", "right"]), entry("left"), entry("right")]);
    expect(removed).toHaveLength(3);
    expect(removed.at(-1)).toBe("base");
    expect(removed.slice(0, 2).sort()).toEqual(["left", "right"]);
  });

  test("an entry required by a skill that is not dropped is kept, and so is what it requires", () => {
    const entries = [entry("base", ["middle"]), entry("middle", ["top", "mine"]), entry("top")];
    expect(order(entries)).toEqual(["top"]);
  });

  test("a staying entry is kept, and so is everything it requires, however deep", () => {
    const chain = [entry("base", ["middle"]), entry("middle", ["top"]), entry("top")];
    expect(order(chain, ["top"])).toEqual([]);
    expect(order(chain, ["middle"])).toEqual(["top"]);
  });

  test("a removable entry that depends on a kept one is still removed, and the kept one is not", () => {
    const entries = [entry("base", ["middle"]), entry("middle", ["top", "mine"]), entry("top")];
    const extra = entry("leaf", []);
    expect(order([...entries, entry("side", ["leaf"]), extra]).sort()).toEqual([
      "leaf",
      "side",
      "top",
    ]);
  });

  test("a staying entry does not hold back an unrelated one", () => {
    const entries = [entry("base", ["top"]), entry("top"), entry("other")];
    expect(order(entries, ["top"])).toEqual(["other"]);
  });

  test("a cycle nothing kept needs is removed in full, each member once", () => {
    const removed = order([entry("ping", ["pong"]), entry("pong", ["ping"])]);
    expect(removed.sort()).toEqual(["ping", "pong"]);
  });

  test("a cycle is kept whole when a skill outside it needs it", () => {
    expect(order([entry("ping", ["pong", "mine"]), entry("pong", ["ping"])])).toEqual([]);
  });

  test("a cycle is kept whole when one of its members is staying", () => {
    expect(order([entry("ping", ["pong"]), entry("pong", ["ping"])], ["pong"])).toEqual([]);
  });

  test("an entry that depends on a free cycle goes first, then the cycle", () => {
    const entries = [entry("ping", ["pong", "top"]), entry("pong", ["ping"]), entry("top")];
    const removed = order(entries);
    expect(removed[0]).toBe("top");
    expect(removed.slice(1).sort()).toEqual(["ping", "pong"]);
  });
});
