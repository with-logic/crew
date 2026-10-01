/**
 * Selector-identity regressions for `crew update <collection>`
 * (PRD §10.1, C-UPD-31/32), plus dependency-closure coverage for
 * collection members.
 *
 * A selector's *kind* is fixed when it first resolves. Re-expansion runs
 * between resolution and targeting and can install new skills, so a run
 * that re-reads raw strings afterwards — or that passes skill and tap
 * names around in one flat list — lets a name collision silently change
 * what the user asked for.
 */

import { describe, expect, test } from "bun:test";
import type { UpdateRow } from "../../../src/install/update/types.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildFlatTap, bump, freshHome, installedBody, installRoot, run } from "./helpers.ts";

const ccRoot = installRoot("upd-coll-x-");
const body = (name: string) => installedBody(ccRoot(), name);

describe("crew update selector identity", () => {
  test("C-UPD-31 a selected skill does not re-expand a tap that shares its name", () => {
    const home = freshHome();
    // Tap `docs` holds a skill literally named `widgets`...
    const docs = buildFlatTap("upd-coll-c1-docs-", ["widgets"]);
    // ...while a different tap is itself named `widgets`, whole-tap installed.
    const widgets = buildFlatTap("upd-coll-c1-tap-", ["one"]);
    run(home, ["tap", "add", `file://${docs}`, "docs"]);
    run(home, ["tap", "add", `file://${widgets}`, "widgets"]);
    expect(run(home, ["install", "docs/widgets"]).code).toBe(0);
    expect(run(home, ["install", "widgets", "--yes"]).code).toBe(0);

    // The unrelated `widgets` TAP gains a sibling upstream.
    makeSkill(widgets, "two", skillFrontmatter({ name: "two" }));
    commitAll(widgets, "add two");

    // Updating the installed SKILL must not touch the same-named tap.
    const j = run(home, ["update", "docs/widgets", "--json"]).json();
    expect(j.selectors).toEqual([{ raw: "docs/widgets", kind: "skill", name: "widgets" }]);
    expect(j.tap_reexpand_rows).toEqual([]);
    expect(j.rows.map((row: { name: string }) => row.name)).toEqual(["widgets"]);
    expect(() => body("two")).toThrow();
    // Not re-expanded is not the same as not fetched: §16.6 scopes the
    // fetch to the taps backing the selection, so the unrelated tap
    // must not appear in the refresh rows at all.
    expect(j.tap_rows.map((row: { name: string }) => row.name)).toEqual(["docs"]);
  });

  test("C-UPD-32 a tap selector keeps its kind when re-expansion adds a same-named child", () => {
    const home = freshHome();
    const acme = buildFlatTap("upd-coll-c2-", ["alpha"]);
    run(home, ["tap", "add", `file://${acme}`, "acme"]);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    // Upstream adds a child whose declared name equals the tap's name.
    makeSkill(acme, "acme", skillFrontmatter({ name: "acme" }));
    commitAll(acme, "add acme child");
    bump(acme, "", "alpha", "alpha-v2");

    const j = run(home, ["update", "acme", "--json"]).json();
    // The selector resolved as a tap before re-expansion; it stays one,
    // so every member is still targeted.
    expect(j.selectors).toEqual([{ raw: "acme", kind: "tap", name: "acme" }]);
    expect(j.rows.map((row: { name: string }) => row.name).sort()).toEqual(["acme", "alpha"]);
    expect(body("alpha")).toContain("alpha-v2");
  });

  test("C-UPD-33 a skill selector does not capture a same-named skill in another tap", () => {
    const home = freshHome();
    // Two taps each publish a skill called `shared`. Only tap `a`'s copy
    // is installed when the run starts.
    const tapA = buildFlatTap("upd-coll-c3-a-", ["shared"]);
    const tapB = buildFlatTap("upd-coll-c3-b-", ["other"]);
    run(home, ["tap", "add", `file://${tapA}`, "a"]);
    run(home, ["tap", "add", `file://${tapB}`, "b"]);
    expect(run(home, ["install", "a/shared"]).code).toBe(0);
    expect(run(home, ["install", "b"]).code).toBe(0);

    // Tap `b` gains its own `shared` upstream. Re-expansion installs it
    // mid-run, so it only exists in state AFTER the selector resolved.
    makeSkill(tapB, "shared", skillFrontmatter({ name: "shared" }));
    commitAll(tapB, "add shared to b");

    // `crew update a/shared` named exactly one install. Refreshing the
    // selection must not adopt `b`'s new same-named skill.
    const j = run(home, ["update", "a/shared", "--json"]).json();
    expect(j.selectors).toEqual([{ raw: "a/shared", kind: "skill", name: "shared" }]);
    const taps = (j.rows as { name: string }[]).map((row) => row.name);
    expect(taps).toEqual(["shared"]);
    // One row, not two: the b-tap copy is a different install.
    expect(j.rows).toHaveLength(1);
  });

  test("C-UPD-33 a project-scope install from another tap is not re-expanded", () => {
    const home = freshHome();
    // Tap `a` holds `shared`, installed at user scope. Tap `b` is
    // whole-tap installed into a project and also publishes `shared`.
    const tapA = buildFlatTap("upd-coll-c4-a-", ["shared"]);
    const tapB = buildFlatTap("upd-coll-c4-b-", ["shared"]);
    run(home, ["tap", "add", `file://${tapA}`, "a"]);
    run(home, ["tap", "add", `file://${tapB}`, "b"]);
    expect(run(home, ["install", "a/shared"]).code).toBe(0);

    const project = makeTempDir("upd-coll-c4-proj-");
    expect(run(home, ["install", "b", "--scope", "project"], project).code).toBe(0);

    // Tap `b` gains a sibling. `crew update a/shared` names an entry in
    // tap `a` only; matching on name alone would select `b`'s project
    // group too and install the sibling there.
    makeSkill(tapB, "sibling", skillFrontmatter({ name: "sibling" }));
    commitAll(tapB, "add sibling to b");

    const j = run(home, ["update", "a/shared", "--json"]).json();
    expect(j.selectors).toEqual([{ raw: "a/shared", kind: "skill", name: "shared" }]);
    expect(j.tap_reexpand_rows).toEqual([]);
    const rows = (j.rows as { name: string; scope: string }[]).map(
      (row) => `${row.name}@${row.scope}`,
    );
    expect(rows).toEqual(["shared@user"]);
  });
});

describe("crew update tap scan cache", () => {
  test("C-UPD-34 one tap installed at user and project scope re-expands both groups", () => {
    const home = freshHome();
    // The same tap, whole-tap installed twice: once at user scope and
    // once into a project. Each is its own (tap, scope, project_root)
    // group, and both must see a newly added sibling — the per-run scan
    // is shared between them, so a cache that served only the first
    // group would silently skip the second.
    const acme = buildFlatTap("upd-coll-c5-", ["alpha"]);
    run(home, ["tap", "add", `file://${acme}`, "acme"]);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    const project = makeTempDir("upd-coll-c5-proj-");
    expect(run(home, ["install", "acme", "--scope", "project"], project).code).toBe(0);

    makeSkill(acme, "beta", skillFrontmatter({ name: "beta" }));
    commitAll(acme, "add beta");

    const j = run(home, ["update", "acme", "--json"]).json();
    const added = (j.tap_reexpand_rows as { name: string; scope: string; kind: string }[])
      .filter((row) => row.kind === "added" && row.name === "beta")
      .map((row) => row.scope)
      .sort();
    expect(added).toEqual(["project", "user"]);
  });
});

describe("crew update collection dependency closure", () => {
  test("C-UPD-26 a selected collection member pulls its installed dependency", () => {
    const home = freshHome();
    // `lib` lives in its own tap; `app` (in tap `acme`) depends on it.
    const libRepo = buildFlatTap("upd-coll-dep-lib-", ["lib"]);
    run(home, ["tap", "add", `file://${libRepo}`, "libs"]);
    expect(run(home, ["install", "libs/lib"]).code).toBe(0);

    const appRepo = buildFlatTap("upd-coll-dep-app-", []);
    makeSkill(appRepo, "app", skillFrontmatter({ name: "app", dependencies: ["lib"] }));
    commitAll(appRepo, "add app");
    run(home, ["tap", "add", `file://${appRepo}`, "acme"]);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    bump(libRepo, "", "lib", "lib-v2");

    // Selecting the TAP selects `app`, whose closure must pull in `lib`
    // even though `lib` is installed from a different tap.
    const j = run(home, ["update", "acme", "--json"]).json();
    expect(j.selectors).toEqual([{ raw: "acme", kind: "tap", name: "acme" }]);
    const rows: UpdateRow[] = j.rows;
    expect(rows.map((row) => row.name).sort()).toEqual(["app", "lib"]);
    const lib = rows.find((row) => row.name === "lib");
    expect(lib?.transitively_required_by).toEqual(["app"]);
    expect(body("lib")).toContain("lib-v2");
  });
});
