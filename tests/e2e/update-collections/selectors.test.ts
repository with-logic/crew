/**
 * E2E tests for collection selectors on `crew update` (PRD §10.1,
 * C-UPD-26..30): a positional may name a tap or a namespace and the
 * command updates everything installed from it.
 *
 * Selector-identity collisions live in `./collisions.test.ts`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import {
  buildFlatTap,
  buildNamespacedTap,
  bump,
  freshHome,
  installedBody,
  run,
} from "./helpers.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let ccRoot = "";
beforeEach(() => {
  ccRoot = makeTempDir("upd-coll-cc-");
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});
const body = (name: string) => installedBody(ccRoot, name);

describe("crew update <namespace>", () => {
  test("C-UPD-27 qualified and bare namespace selectors touch only that namespace", () => {
    const home = freshHome();
    const repo = buildNamespacedTap("upd-coll-ns-", { marketing: ["copy", "seo"], eng: ["lint"] });
    expect(run(home, ["tap", "add", `file://${repo}`, "acme"]).code).toBe(0);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    bump(repo, "skills/marketing", "copy", "copy-v2");
    bump(repo, "skills/eng", "lint", "lint-v2");

    const r = run(home, ["update", "acme/marketing"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Updating namespace marketing (2 skills)");
    expect(body("copy")).toContain("copy-v2");
    expect(body("lint")).not.toContain("lint-v2");

    const bare = run(home, ["update", "marketing", "--json"]).json();
    expect(bare.selectors).toEqual([{ raw: "marketing", kind: "namespace", name: "marketing" }]);
    expect(bare.rows.map((row: { name: string }) => row.name).sort()).toEqual(["copy", "seo"]);
    expect(body("lint")).not.toContain("lint-v2");
  });

  test("C-UPD-28 a bare namespace present in two taps is ambiguous", () => {
    const home = freshHome();
    const a = buildNamespacedTap("upd-coll-amb-a-", { marketing: ["copy"] });
    const b = buildNamespacedTap("upd-coll-amb-b-", { marketing: ["seo"] });
    run(home, ["tap", "add", `file://${a}`, "tap-a"]);
    run(home, ["tap", "add", `file://${b}`, "tap-b"]);
    expect(run(home, ["install", "tap-a"]).code).toBe(0);
    expect(run(home, ["install", "tap-b"]).code).toBe(0);

    const r = run(home, ["update", "marketing", "--json"]);
    expect(r.code).toBe(4);
    const err = r.json().error!;
    expect(err.name).toBe("ambiguous_reference");
    expect(err.details.candidates).toEqual(["tap-a/marketing", "tap-b/marketing"]);
  });

  test("C-UPD-28 a word that is both a tap and a namespace elsewhere is ambiguous", () => {
    const home = freshHome();
    const a = buildNamespacedTap("upd-coll-amb-c-", { marketing: ["copy"] });
    const b = buildFlatTap("upd-coll-amb-d-", ["other"]);
    run(home, ["tap", "add", `file://${a}`, "tap-a"]);
    run(home, ["tap", "add", `file://${b}`, "marketing"]);
    expect(run(home, ["install", "tap-a"]).code).toBe(0);

    const r = run(home, ["update", "marketing", "--json"]);
    expect(r.code).toBe(4);
    expect(r.json().error!.details.candidates).toEqual(["marketing", "tap-a/marketing"]);
  });
});

describe("crew update selector precedence and errors", () => {
  test("C-UPD-28 a tap wins over its own same-named namespace", () => {
    const home = freshHome();
    const repo = buildNamespacedTap("upd-coll-own-ns-", { marketing: ["copy"], eng: ["lint"] });
    run(home, ["tap", "add", `file://${repo}`, "marketing"]);
    expect(run(home, ["install", "marketing"]).code).toBe(0);
    const result = run(home, ["update", "marketing", "--json"]);
    expect(result.code).toBe(0);
    expect(result.json().selectors).toEqual([{ raw: "marketing", kind: "tap", name: "marketing" }]);
    expect(
      result
        .json()
        .rows.map((row) => row.name)
        .sort(),
    ).toEqual(["copy", "lint"]);
  });

  test("C-UPD-28 an installed skill name wins over a same-named tap", () => {
    const home = freshHome();
    const skills = buildFlatTap("upd-coll-prec-a-", ["pdf"]);
    const other = buildFlatTap("upd-coll-prec-b-", ["other"]);
    run(home, ["tap", "add", `file://${skills}`, "docs"]);
    run(home, ["tap", "add", `file://${other}`, "pdf"]);
    expect(run(home, ["install", "docs/pdf"]).code).toBe(0);

    const j = run(home, ["update", "pdf", "--json"]).json();
    expect(j.selectors).toEqual([{ raw: "pdf", kind: "skill", name: "pdf" }]);
    expect(j.rows.map((row: { name: string }) => row.name)).toEqual(["pdf"]);
  });

  test("C-UPD-28 an installed skill name wins over a same-named namespace", () => {
    const home = freshHome();
    // `acme` has a namespace `pdf` holding `reader`; a flat tap holds a
    // skill literally named `pdf`. The bare word matches both, and the
    // skill must win (§10.1 resolution order).
    const acme = buildNamespacedTap("upd-coll-prec-ns-", { pdf: ["reader"] });
    const flat = buildFlatTap("upd-coll-prec-flat-", ["pdf"]);
    run(home, ["tap", "add", `file://${acme}`, "acme"]);
    run(home, ["tap", "add", `file://${flat}`, "flat"]);
    expect(run(home, ["install", "acme"]).code).toBe(0);
    expect(run(home, ["install", "flat/pdf"]).code).toBe(0);

    const j = run(home, ["update", "pdf", "--json"]).json();
    expect(j.selectors).toEqual([{ raw: "pdf", kind: "skill", name: "pdf" }]);
    // The namespace's member must not be dragged in.
    expect(j.rows.map((row: { name: string }) => row.name)).toEqual(["pdf"]);
  });

  test("C-UPD-30 an unmatched selector names all three things it could have been", () => {
    const home = freshHome();
    const r = run(home, ["update", "nope", "--json"]);
    expect(r.code).toBe(4);
    const err = r.json().error!;
    expect(err.name).toBe("unknown_skill");
    expect(err.message).toContain("isn't an installed skill, a tap, or a namespace");
  });
});
