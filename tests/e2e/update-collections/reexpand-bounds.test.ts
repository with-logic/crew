/**
 * Bounds on what `crew update <selector>` re-expansion installs and
 * keeps selected (PRD §10.1, §10.1.1, C-UPD-36/37).
 *
 * Re-expansion groups are keyed by `(tap, scope, project_root)`, so the
 * group behind a namespace selector spans the whole tap. Two things
 * must still hold: additions are bounded by the namespace the user
 * named, and an entry whose source path the same run rewrites stays in
 * the selection.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { commitAll, makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildNamespacedTap, bump, freshHome, installedBody, installRoot, run } from "./helpers.ts";

const ccRoot = installRoot("upd-coll-b-");
const body = (name: string) => installedBody(ccRoot(), name);

describe("crew update namespace re-expansion bounds", () => {
  test("C-UPD-36 a namespace selector does not install additions from a sibling namespace", () => {
    const home = freshHome();
    const repo = buildNamespacedTap("upd-coll-b1-", { marketing: ["copy"], eng: ["lint"] });
    run(home, ["tap", "add", `file://${repo}`, "acme"]);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    // One addition in the named namespace, one in a sibling. The group
    // spans the whole tap, so an unbounded re-expansion installs both.
    makeSkill(join(repo, "skills", "marketing"), "seo", skillFrontmatter({ name: "seo" }));
    makeSkill(join(repo, "skills", "eng"), "fmt", skillFrontmatter({ name: "fmt" }));
    commitAll(repo, "add seo and fmt");

    expect(run(home, ["update", "acme/marketing"]).code).toBe(0);
    expect(body("seo")).toContain("name: seo");
    // `fmt` lives under a namespace the user did not name.
    expect(() => body("fmt")).toThrow();
  });

  test("C-UPD-36 naming the tap installs additions from every namespace", () => {
    const home = freshHome();
    const repo = buildNamespacedTap("upd-coll-b2-", { marketing: ["copy"], eng: ["lint"] });
    run(home, ["tap", "add", `file://${repo}`, "acme"]);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    makeSkill(join(repo, "skills", "marketing"), "seo", skillFrontmatter({ name: "seo" }));
    makeSkill(join(repo, "skills", "eng"), "fmt", skillFrontmatter({ name: "fmt" }));
    commitAll(repo, "add seo and fmt");

    // Naming the tap asks for the whole tap, so nothing is bounded.
    expect(run(home, ["update", "acme"]).code).toBe(0);
    expect(body("seo")).toContain("name: seo");
    expect(body("fmt")).toContain("name: fmt");
  });
});

describe("crew update entry identity across relocation", () => {
  test("C-UPD-37 a skill moved to another namespace upstream still updates", () => {
    const home = freshHome();
    const repo = buildNamespacedTap("upd-coll-b3-", { alpha: ["mover"] });
    run(home, ["tap", "add", `file://${repo}`, "acme"]);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    // Upstream moves `mover` from namespace `alpha` to `beta` and
    // changes its body. Both land in one commit, so the same run that
    // rewrites the entry's recorded path must also update its bytes.
    mkdirSync(join(repo, "skills", "beta"));
    renameSync(join(repo, "skills", "alpha", "mover"), join(repo, "skills", "beta", "mover"));
    commitAll(repo, "move mover to beta");
    bump(repo, join("skills", "beta"), "mover", "mover-v2");

    // Selected by NAMESPACE, not by tap: a tap selector matches the
    // group by tap name and never consults entry identity, so it would
    // mask the bug this test exists for.
    const j = run(home, ["update", "acme/alpha", "--json"]).json();
    // Relocation is not deletion: the skill is still in the tap, so it
    // must not be reported `source_gone`.
    const outcomes = j.rows.map((row) => `${row.name}:${row.outcome.kind}`);
    expect(outcomes).not.toContain("mover:source_gone");
    expect(body("mover")).toContain("mover-v2");
  });
});
