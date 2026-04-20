/**
 * `crew update <name>` expands the update set to include every entry
 * transitively required by a named entry (C-UPD-24).
 *
 * We install from local paths so state.required_by is populated without
 * requiring a git fixture, then call `crew update` against various
 * subsets and inspect the `--json` rows to confirm which entries were
 * considered and how they're tagged.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../src/agents/gemini-cli.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let ccRoot: string;
let coRoot: string;
let geRoot: string;
let originals: {
  cc: { user: () => string; detect: () => boolean };
  co: { user: () => string; detect: () => boolean };
  ge: { user: () => string; detect: () => boolean };
};

beforeEach(() => {
  ccRoot = makeTempDir("crew-cc-");
  coRoot = makeTempDir("crew-co-");
  geRoot = makeTempDir("crew-ge-");
  originals = {
    cc: { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
    co: { user: codexAdapter.userPath, detect: codexAdapter.detect },
    ge: { user: geminiCliAdapter.userPath, detect: geminiCliAdapter.detect },
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => geRoot;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.user;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.detect;
  (codexAdapter as { userPath: () => string }).userPath = originals.co.user;
  (codexAdapter as { detect: () => boolean }).detect = originals.co.detect;
  (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.user;
  (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.detect;
});

/** Shape of the rows we assert against. */
interface UpdateJson {
  readonly rows: readonly {
    readonly name: string;
    readonly scope: string;
    readonly outcome: { readonly kind: string };
    readonly transitively_required_by?: readonly string[];
  }[];
}

function runUpdateJson(home: string, args: readonly string[]): UpdateJson {
  const c = captureStreams();
  runCli(["update", "--json", ...args], { home, streams: c.streams });
  return JSON.parse(c.stdout()) as UpdateJson;
}

describe("C-UPD-24 crew update <name> dependency closure", () => {
  test("crew update <name> picks up its direct dep, marked as transitive", () => {
    const home = makeCrewHome();
    // Remove core tap so offline install-from-path works without net.
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const src = makeTempDir();
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    expect(runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams })).toBe(
      0,
    );

    // Sanity: state has both, with bar.required_by = ["foo"].
    const state = readState(home);
    const bar = state.installations.find((e) => e.name === "bar")!;
    expect(bar.required_by).toEqual(["foo"]);

    const json = runUpdateJson(home, ["foo"]);
    const names = json.rows.map((r) => r.name).sort();
    expect(names).toEqual(["bar", "foo"]);
    const barRow = json.rows.find((r) => r.name === "bar")!;
    expect(barRow.transitively_required_by).toEqual(["foo"]);
    const fooRow = json.rows.find((r) => r.name === "foo")!;
    // `foo` was named directly — NOT marked transitive.
    expect(fooRow.transitively_required_by).toBeUndefined();
  });

  test("crew update <name> walks multi-level closure (foo -> bar -> baz)", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const src = makeTempDir();
    makeSkill(src, "baz", skillFrontmatter({ name: "baz" }));
    makeSkill(src, "bar", skillFrontmatter({ name: "bar", dependencies: [join(src, "baz")] }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    expect(runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams })).toBe(
      0,
    );

    const json = runUpdateJson(home, ["foo"]);
    const names = json.rows.map((r) => r.name).sort();
    expect(names).toEqual(["bar", "baz", "foo"]);
    // Both transitives attribute to `foo`.
    expect(json.rows.find((r) => r.name === "bar")!.transitively_required_by).toEqual(["foo"]);
    expect(json.rows.find((r) => r.name === "baz")!.transitively_required_by).toEqual(["foo"]);
  });

  test("crew update <a> <b> merges closures; dep shared by both is attributed to both", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const src = makeTempDir();
    makeSkill(src, "shared", skillFrontmatter({ name: "shared" }));
    makeSkill(src, "a", skillFrontmatter({ name: "a", dependencies: [join(src, "shared")] }));
    makeSkill(src, "b", skillFrontmatter({ name: "b", dependencies: [join(src, "shared")] }));
    expect(runCli(["install", join(src, "a")], { home, streams: captureStreams().streams })).toBe(
      0,
    );
    expect(runCli(["install", join(src, "b")], { home, streams: captureStreams().streams })).toBe(
      0,
    );

    // Sanity: the fix in `rebuildRequiredBy` means `shared.required_by`
    // now contains both `a` and `b` after the second install — not just
    // whichever was installed last.
    const state = readState(home);
    const shared = state.installations.find((e) => e.name === "shared")!;
    expect(shared.required_by).toEqual(["a", "b"]);
    const json = runUpdateJson(home, ["a", "b"]);
    const sharedRow = json.rows.find((r) => r.name === "shared")!;
    expect(sharedRow.transitively_required_by).toEqual(["a", "b"]);
  });

  test("crew update with no args does not tag transitively_required_by", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const src = makeTempDir();
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });

    const json = runUpdateJson(home, []);
    for (const row of json.rows) {
      expect(row.transitively_required_by).toBeUndefined();
    }
  });

  test("human output marks transitives with `(required by <names>)`", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const src = makeTempDir();
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });

    const c = captureStreams();
    runCli(["update", "foo"], { home, streams: c.streams });
    // `bar` line must mention it was pulled in by `foo`.
    expect(c.stdout()).toMatch(/bar.*required by foo/);
    // `foo` line must NOT mention a parent (it's a top-level name).
    expect(c.stdout()).not.toMatch(/foo.*required by/);
  });

  test("crew update <name> updates changed local deps even when parent is unchanged", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const src = makeTempDir();
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }), "v1");
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });

    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }), "v2");
    const code = runCli(["update", "foo"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    expect(readFileSync(join(ccRoot, "bar", "SKILL.md"), "utf8")).toContain("v2");
    expect(readState(home).installations.find((e) => e.name === "bar")!.resolved_sha).toBe(null);
  });
});
