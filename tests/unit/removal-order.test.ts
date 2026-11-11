/**
 * Removal order for dropped manifest entries (§9.2): dependents before
 * what they depend on, nothing that something staying still needs, and
 * cycles taken apart only when nothing outside them needs them.
 */
import { describe, expect, test } from "bun:test";
import { planRemovalOrder } from "../../src/commands/install/manifest/removal/order.ts";
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

/** Drain `order`, treating every name in `aborting` as a removal that aborts. */
function drain(entries: readonly StateEntry[], aborting: readonly string[] = []): string[] {
  const order = planRemovalOrder(entries);
  const offered: string[] = [];
  for (let name = order.next(); name !== undefined; name = order.next()) {
    offered.push(name);
    if (aborting.includes(name)) order.aborted(name);
    else order.removed(name);
  }
  return offered;
}

describe("planRemovalOrder", () => {
  test("nothing dropped offers nothing", () => {
    expect(drain([])).toEqual([]);
  });

  test("independent entries are all offered", () => {
    expect(drain([entry("a"), entry("b")]).sort()).toEqual(["a", "b"]);
  });

  test("a chain is offered dependents first", () => {
    const chain = [entry("base", ["middle"]), entry("middle", ["top"]), entry("top")];
    expect(drain(chain)).toEqual(["top", "middle", "base"]);
  });

  test("a dependency shared by two dependents waits for both", () => {
    const offered = drain([entry("base", ["left", "right"]), entry("left"), entry("right")]);
    expect(offered.at(-1)).toBe("base");
    expect(offered.slice(0, 2).sort()).toEqual(["left", "right"]);
  });

  test("an entry required by a skill that is not dropped is never offered, nor is what it requires", () => {
    const entries = [entry("base", ["middle"]), entry("middle", ["top", "mine"]), entry("top")];
    expect(drain(entries)).toEqual(["top"]);
  });

  test("when a removal aborts, what that entry requires is no longer offered", () => {
    const chain = [entry("base", ["middle"]), entry("middle", ["top"]), entry("top")];
    expect(drain(chain, ["middle"])).toEqual(["top", "middle"]);
  });

  test("an abort does not hold back an unrelated entry", () => {
    const entries = [entry("base", ["top"]), entry("top"), entry("other")];
    expect(drain(entries, ["top"]).sort()).toEqual(["other", "top"]);
  });

  test("a cycle nothing outside it needs is offered in full", () => {
    expect(drain([entry("ping", ["pong"]), entry("pong", ["ping"])]).sort()).toEqual([
      "ping",
      "pong",
    ]);
  });

  test("a cycle that a skill outside it needs is not offered at all", () => {
    expect(drain([entry("ping", ["pong", "mine"]), entry("pong", ["ping"])])).toEqual([]);
  });

  test("an entry marked as staying before the first offer holds back what it requires", () => {
    const order = planRemovalOrder([entry("base", ["top"]), entry("top"), entry("other")]);
    order.aborted("top");
    expect(order.next()).toBe("other");
    order.removed("other");
    expect(order.next()).toBeUndefined();
  });
});
