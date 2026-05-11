/**
 * Installed state selector tests (§7.4, §10.1).
 */

import { describe, expect, test } from "bun:test";
import { chooseEntries } from "../../src/commands/update/selection.ts";
import type { StateEntry, StateFile } from "../../src/core/types.ts";
import { resolveStateSubject, resolveStateSubjects } from "../../src/state/subjects.ts";

function stateEntry(
  name: string,
  tap: string,
  path: string,
  requiredBy: readonly string[] = [],
): StateEntry {
  return {
    name,
    source: { tap, path },
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:abc",
    scope: "user",
    installed_at: "2026-01-01T00:00:00.000Z",
    agents: ["codex"],
    pinned: false,
    explicit: true,
    required_by: requiredBy,
  };
}

const state: StateFile = {
  schema_version: 1,
  installations: [
    stateEntry("pdf", "anthropic", "skills/pdf"),
    stateEntry("pdf", "other", "skills/pdf"),
    stateEntry("forecast", "anthropic", "skills/finance/forecast"),
  ],
};

describe("resolveStateSubject", () => {
  test("bare names match installed state entries directly", () => {
    const subject = resolveStateSubject(state, "pdf");
    expect(subject.name).toBe("pdf");
    expect(subject.entries.map((entry) => entry.source.tap)).toEqual(["anthropic", "other"]);
  });

  test("tap-qualified selectors narrow to the matching tap", () => {
    const subject = resolveStateSubject(state, "anthropic/pdf");
    expect(subject.name).toBe("pdf");
    expect(subject.entries.map((entry) => entry.source.tap)).toEqual(["anthropic"]);
  });

  test("tap-qualified selectors do not ignore ref tails", () => {
    const subject = resolveStateSubject(state, "anthropic/pdf@v1");
    expect(subject.entries).toHaveLength(0);
  });

  test("namespace-qualified selectors match the installed namespace path", () => {
    const subject = resolveStateSubject(state, "anthropic/finance/forecast");
    expect(subject.name).toBe("forecast");
    expect(subject.entries).toHaveLength(1);
  });

  test("namespace-qualified selectors ignore non-namespaced installed entries", () => {
    const subject = resolveStateSubject(
      { schema_version: 1, installations: [stateEntry("forecast", "anthropic", "forecast")] },
      "anthropic/finance/forecast",
    );
    expect(subject.entries).toHaveLength(0);
  });

  test("invalid or non-state references return an empty raw selector", () => {
    expect(resolveStateSubject(state, "not a ref").entries).toHaveLength(0);
    expect(resolveStateSubject(state, "foo bar").entries).toHaveLength(0);
    expect(resolveStateSubject(state, "./pdf").entries).toHaveLength(0);
    expect(resolveStateSubject(state, "anthropic/missing").raw).toBe("anthropic/missing");
  });

  test("resolveStateSubjects preserves argument order", () => {
    const subjects = resolveStateSubjects(state, ["anthropic/pdf", "anthropic/finance/forecast"]);
    expect(subjects.map((subject) => subject.name)).toEqual(["pdf", "forecast"]);
  });
});

describe("chooseEntries", () => {
  test("unknown state selectors use the raw user input in the error", () => {
    expect(() =>
      chooseEntries(state, [{ raw: "anthropic/missing", name: "anthropic/missing", entries: [] }]),
    ).toThrow("anthropic/missing");
  });

  test("selected entries include dependency closure in stable order", () => {
    const root = stateEntry("foo", "core", "foo");
    const dep = stateEntry("bar", "core", "bar", ["foo"]);
    const nested = stateEntry("baz", "core", "baz", ["bar"]);
    const selected = chooseEntries({ schema_version: 1, installations: [dep, root, nested] }, [
      { raw: "foo", name: "foo", entries: [root] },
    ]);
    expect(selected.entries.map((entry) => entry.name)).toEqual(["foo", "bar", "baz"]);
    expect(selected.transitiveSources.get("bar")).toEqual(["foo"]);
    expect(selected.transitiveSources.get("baz")).toEqual(["foo"]);
  });
});
