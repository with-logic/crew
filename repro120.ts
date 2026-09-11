import type { Config, StateEntry, StateFile } from "./src/core/types.ts";
import { refreshCollectionSubjects, resolveCollectionSubject } from "./src/state/collections.ts";

const mk = (name: string, tap: string, scope: "user" | "project", root?: string): StateEntry =>
  ({
    name,
    scope,
    agents: ["claude-code"],
    explicit: true,
    pinned: false,
    required_by: [],
    installed_at: "2026-01-01T00:00:00Z",
    resolved_sha: "a".repeat(40),
    source: { tap, path: `skills/${name}` },
    ...(root === undefined ? {} : { project_root: root }),
  }) as StateEntry;

const before: StateFile = { version: 1, installations: [mk("foo", "a", "user")] } as StateFile;
const config = { taps: [{ name: "a" }, { name: "b" }] } as unknown as Config;

const subject = resolveCollectionSubject(before, config, "a/foo");
console.log(
  "resolved:",
  subject.kind,
  "entries:",
  subject.entries.map((e) => `${e.source.tap}/${e.name}@${e.scope}`),
);

const after: StateFile = {
  version: 1,
  installations: [
    mk("foo", "a", "user"),
    mk("foo", "b", "user"),
    mk("foo", "b", "project", "/tmp/other-project"),
  ],
} as StateFile;

const refreshed = refreshCollectionSubjects(after, [subject])[0]!;
console.log(
  "after refresh:",
  refreshed.entries.map((e) => `${e.source.tap}/${e.name}@${e.scope}`),
);
console.log(
  refreshed.entries.length === 1 ? "OK — stayed bound to a/foo" : "BUG — captured unrelated entries",
);
