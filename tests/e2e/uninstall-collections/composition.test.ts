/**
 * How `crew uninstall` collection selectors compose (§7.4).
 *
 * Covers the flags and shapes that layer on top of resolution: `--agent`
 * and `--prune`, the `--json` collection contract, overlapping selectors
 * (C-UNINST-25), and scope narrowing (C-UNINST-26).
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { addTap, buildTap, install, installed, quiet, useClaudeCodeAdapter } from "./helpers.ts";

useClaudeCodeAdapter();

describe("collection selector composition", () => {
  test("C-UNINST-19 collection removal composes with --agent", () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-ag-", { ".": ["alpha", "beta"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);

    // claude-code is the only agent these installs named, so removing it
    // empties both entries.
    expect(
      runCli(["uninstall", "--agent", "claude-code", "acme"], { home, streams: quiet() }),
    ).toBe(0);
    expect(installed(home)).toEqual([]);
  });

  test("C-UNINST-19 --json records carry the collection they came from", () => {
    const home = makeCrewHome();
    expect(
      addTap(
        home,
        buildTap("crew-json-", { marketing: ["email-outreach"], eng: ["testing"] }),
        "acme",
      ),
    ).toBe(0);
    expect(install(home, ["acme"])).toBe(0);

    const cap = captureStreams();
    expect(runCli(["uninstall", "--json", "acme/marketing"], { home, streams: cap.streams })).toBe(
      0,
    );
    const payload = JSON.parse(cap.stdout()) as {
      records: { name: string; collection?: { kind: string; name: string } }[];
    };
    expect(payload.records).toHaveLength(1);
    expect(payload.records[0]!.name).toBe("email-outreach");
    expect(payload.records[0]!.collection).toEqual({ kind: "namespace", name: "marketing" });
  });

  test("C-UNINST-19 a skill selector's --json record carries no collection", () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-json2-", { ".": ["alpha"] }), "acme")).toBe(0);
    expect(install(home, ["alpha"])).toBe(0);

    const cap = captureStreams();
    expect(runCli(["uninstall", "--json", "alpha"], { home, streams: cap.streams })).toBe(0);
    const payload = JSON.parse(cap.stdout()) as {
      records: { collection?: { kind: string; name: string } }[];
    };
    expect(payload.records[0]!.collection).toBeUndefined();
  });

  test("C-UNINST-25 overlapping selectors remove each skill exactly once", () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-dedupe-", { ".": ["alpha", "beta"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);

    // `alpha` is inside tap `acme`, so the two selectors overlap. Removing
    // it twice would fail on the second, already-deleted directory.
    const cap = captureStreams();
    expect(runCli(["uninstall", "acme", "alpha"], { home, streams: cap.streams })).toBe(0);
    expect(installed(home)).toEqual([]);
    expect(cap.stdout()).not.toContain("wasn't installed here");
  });

  test("C-UNINST-26 a tap selector reaches a lone project install from any cwd", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    expect(addTap(home, buildTap("crew-lone-", { ".": ["alpha"] }), "acme")).toBe(0);
    expect(install(home, ["--scope", "project", "acme"], project)).toBe(0);

    // §7.4: one project install is reachable from anywhere, and a tap
    // selector must narrow the same way a skill selector does.
    const elsewhere = makeTempDir("crew-elsewhere-");
    expect(
      runCli(["uninstall", "--scope", "project", "acme"], {
        home,
        cwd: elsewhere,
        streams: quiet(),
      }),
    ).toBe(0);
    expect(installed(home)).toEqual([]);
  });

  test("C-UNINST-19 collection removal composes with --prune", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-dep-");
    makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
    makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
    expect(install(home, [join(src, "foo")])).toBe(0);
    expect(installed(home)).toEqual(["bar", "foo"]);

    // The path install created an auto tap; naming it removes `foo`, and
    // `--prune` then sweeps `bar`, which nothing requires any more.
    const tap = readState(home).installations.find((e) => e.name === "foo")!.source.tap;
    expect(runCli(["uninstall", "--prune", tap], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual([]);
  });

  test("C-UNINST-26 a namespace is not ambiguous when the collision is out of scope", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj2-");
    expect(addTap(home, buildTap("crew-sc-a-", { marketing: ["email-outreach"] }), "acme")).toBe(0);
    expect(addTap(home, buildTap("crew-sc-b-", { marketing: ["brand-voice"] }), "other")).toBe(0);
    // Same namespace name in two taps, but at two different scopes.
    expect(install(home, ["acme"])).toBe(0);
    expect(install(home, ["--scope", "project", "other"], project)).toBe(0);

    // Only the user-scope one is a candidate, so this is unambiguous.
    expect(runCli(["uninstall", "marketing"], { home, cwd: project, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["brand-voice"]);
  });
});
