/**
 * Direct tests for the batched state mutation behind
 * `crew tap remove --uninstall` (§7.4, §11.1).
 *
 * `dropEntriesAndUpdateRequiredBy` drops a whole removal set in one
 * traversal. The subtle part is which `required_by` edges it scrubs: only
 * names removed at the SAME §11.1 location may come off, and every other
 * edge on that same survivor has to be preserved.
 */

import { describe, expect, test } from "bun:test";
import { dropEntriesAndUpdateRequiredBy } from "../../src/commands/uninstall/state.ts";
import type { StateEntry, StateFile } from "../../src/core/types.ts";

function entry(over: Partial<StateEntry>): StateEntry {
  return {
    name: "skill",
    scope: "user",
    agents: ["claude-code"],
    explicit: true,
    required_by: [],
    source: { tap: "mytap", path: "skill" },
    ref: null,
    resolved_sha: null,
    pinned: false,
    content_hash: "sha256:abc",
    installed_at: "2020-01-01T00:00:00Z",
    ...over,
  } as StateEntry;
}

function stateOf(installations: StateEntry[]): StateFile {
  return { schema_version: 1, installations };
}

describe("dropEntriesAndUpdateRequiredBy", () => {
  test("returns the same state when there is nothing to drop", () => {
    const state = stateOf([entry({ name: "alpha" })]);
    expect(dropEntriesAndUpdateRequiredBy(state, [])).toBe(state);
  });

  test("scrubs removed names from a survivor but keeps its other edges", () => {
    // `dep` is required by two skills at the same location. Only `alpha`
    // is being removed, so `beta` must survive on the edge list — this is
    // the "keep what you should keep" half of the scrub.
    const alpha = entry({ name: "alpha" });
    const dep = entry({ name: "dep", explicit: false, required_by: ["alpha", "beta"] });
    const beta = entry({ name: "beta" });

    const next = dropEntriesAndUpdateRequiredBy(stateOf([alpha, dep, beta]), [alpha]);

    expect(next.installations.map((e) => e.name)).toEqual(["dep", "beta"]);
    expect(next.installations[0]!.required_by).toEqual(["beta"]);
  });

  test("leaves a survivor untouched when no edge changes", () => {
    // Same location, but the removed name is not on the edge list, so the
    // entry object is passed through unchanged rather than rebuilt.
    const alpha = entry({ name: "alpha" });
    const dep = entry({ name: "dep", explicit: false, required_by: ["beta"] });

    const next = dropEntriesAndUpdateRequiredBy(stateOf([alpha, dep]), [alpha]);

    expect(next.installations).toHaveLength(1);
    expect(next.installations[0]).toBe(dep);
  });

  test("a same-named skill at another location keeps its own edges", () => {
    // §11.1 keys by (name, scope, project_root). Removing user-scope
    // `alpha` must not scrub the `alpha` edge from a project-scope `dep`,
    // whose own `alpha` is still installed.
    const userAlpha = entry({ name: "alpha", scope: "user" });
    const projDep = entry({
      name: "dep",
      scope: "project",
      project_root: "/tmp/proj",
      explicit: false,
      required_by: ["alpha"],
    });

    const next = dropEntriesAndUpdateRequiredBy(stateOf([userAlpha, projDep]), [userAlpha]);

    expect(next.installations).toHaveLength(1);
    expect(next.installations[0]!.required_by).toEqual(["alpha"]);
  });

  test("drops every target in the set in one pass", () => {
    const a = entry({ name: "a" });
    const b = entry({ name: "b" });
    const keep = entry({ name: "keep" });

    const next = dropEntriesAndUpdateRequiredBy(stateOf([a, b, keep]), [a, b]);

    expect(next.installations.map((e) => e.name)).toEqual(["keep"]);
  });
});
