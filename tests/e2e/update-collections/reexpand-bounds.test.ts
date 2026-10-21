/**
 * Bounds on what `crew update <selector>` re-expansion installs and
 * keeps selected (PRD §10.1, §10.1.1, C-UPD-05/24/36/37).
 *
 * Re-expansion groups are keyed by `(tap, scope, project_root)`, so the
 * group behind a namespace selector spans the whole tap. Two things
 * must still hold: additions are bounded by the namespace the user
 * named, and an entry whose source path the same run rewrites stays in
 * the selection.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readState } from "../../../src/state/load.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { buildNamespacedTap, bump, freshHome, installedBody, run } from "./helpers.ts";

const originalUserPath = claudeCodeAdapter.userPath;
const originalDetect = claudeCodeAdapter.detect;
let ccRoot = "";
beforeEach(() => {
  ccRoot = makeTempDir("upd-coll-b-");
  claudeCodeAdapter.userPath = () => ccRoot;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = originalUserPath;
  claudeCodeAdapter.detect = originalDetect;
});
const body = (name: string) => installedBody(ccRoot, name);

describe("crew update namespace re-expansion bounds", () => {
  test("C-UPD-36 a namespace selector does not install additions from a sibling namespace", () => {
    const home = freshHome();
    const repo = buildNamespacedTap("upd-coll-b1-", { marketing: ["copy"], eng: ["lint"] });
    run(home, ["tap", "add", `file://${repo}`, "acme"]);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    // Additions in the named namespace, a sibling, and directly under skills/.
    makeSkill(join(repo, "skills", "marketing"), "seo", skillFrontmatter({ name: "seo" }));
    makeSkill(join(repo, "skills", "eng"), "fmt", skillFrontmatter({ name: "fmt" }));
    makeSkill(join(repo, "skills"), "global-tool", skillFrontmatter({ name: "global-tool" }));
    commitAll(repo, "add seo, fmt and global-tool");

    expect(run(home, ["update", "acme/marketing"]).code).toBe(0);
    expect(body("seo")).toContain("name: seo");
    // `fmt` lives under a namespace the user did not name.
    expect(() => body("fmt")).toThrow();
    expect(() => body("global-tool")).toThrow();
  });

  test("C-UPD-36 naming the tap installs additions from every namespace", () => {
    const home = freshHome();
    const repo = buildNamespacedTap("upd-coll-b2-", { marketing: ["copy"], eng: ["lint"] });
    run(home, ["tap", "add", `file://${repo}`, "acme"]);
    expect(run(home, ["install", "acme"]).code).toBe(0);

    makeSkill(join(repo, "skills", "marketing"), "seo", skillFrontmatter({ name: "seo" }));
    makeSkill(join(repo, "skills", "eng"), "fmt", skillFrontmatter({ name: "fmt" }));
    makeSkill(join(repo, "skills"), "global-tool", skillFrontmatter({ name: "global-tool" }));
    commitAll(repo, "add seo, fmt and global-tool");

    // Naming the tap asks for the whole tap, so nothing is bounded.
    expect(run(home, ["update", "acme"]).code).toBe(0);
    expect(body("seo")).toContain("name: seo");
    expect(body("fmt")).toContain("name: fmt");
    expect(body("global-tool")).toContain("name: global-tool");
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

for (const selector of ["alpha", "acme/one"]) {
  test(`C-UPD-05 ${selector} preserves an unselected sibling's relocated state`, () => {
    const home = freshHome();
    const repo = buildNamespacedTap("upd-coll-relocation-", { one: ["alpha"], two: ["beta"] });
    expect(run(home, ["tap", "add", `file://${repo}`, "acme"]).code).toBe(0);
    expect(run(home, ["install", "acme"]).code).toBe(0);
    const betaBefore = readState(home).installations.find((entry) => entry.name === "beta")!;
    const betaBody = body("beta");
    const betaMarkerPath = join(ccRoot, "beta", ".crew.json");
    const betaMarker = readFileSync(betaMarkerPath, "utf8");

    mkdirSync(join(repo, "skills", "moved"));
    for (const [namespace, name] of [
      ["one", "alpha"],
      ["two", "beta"],
    ] as const) {
      renameSync(join(repo, "skills", namespace, name), join(repo, "skills", "moved", name));
      makeSkill(join(repo, "skills", "moved"), name, skillFrontmatter({ name }), `${name}-v2`);
    }
    const newSha = commitAll(repo, "move and change alpha and beta");

    const selected = run(home, ["update", selector, "--json"]);
    expect(selected.code).toBe(0);
    expect(selected.json().rows.map((row) => row.name)).toEqual(["alpha"]);
    expect(body("alpha")).toContain("alpha-v2");
    const alpha = readState(home).installations.find((entry) => entry.name === "alpha")!;
    expect(alpha.source.path).toBe("skills/moved/alpha");
    expect(alpha.resolved_sha).toBe(newSha);
    expect(readState(home).installations.find((entry) => entry.name === "beta")).toEqual(
      betaBefore,
    );
    expect(body("beta")).toBe(betaBody);
    expect(readFileSync(betaMarkerPath, "utf8")).toBe(betaMarker);

    const remaining = selector === "alpha" ? ["acme"] : [];
    expect(run(home, ["update", ...remaining]).code).toBe(0);
    const beta = readState(home).installations.find((entry) => entry.name === "beta")!;
    expect(beta.source.path).toBe("skills/moved/beta");
    expect(beta.resolved_sha).toBe(newSha);
    expect(body("beta")).toContain("beta-v2");
    expect(JSON.parse(readFileSync(betaMarkerPath, "utf8")).path).toBe(beta.source.path);
  });
}

test("C-UPD-24 a selected skill's relocated dependency still updates", () => {
  const home = freshHome();
  const repo = buildNamespacedTap("upd-coll-dep-move-", { one: ["alpha", "beta"] });
  makeSkill(
    join(repo, "skills", "one"),
    "alpha",
    skillFrontmatter({
      name: "alpha",
      dependencies: ["beta"],
    }),
  );
  commitAll(repo, "alpha depends on beta");
  expect(run(home, ["tap", "add", `file://${repo}`, "acme"]).code).toBe(0);
  expect(run(home, ["install", "acme"]).code).toBe(0);
  expect(
    readState(home).installations.find((entry) => entry.name === "beta")!.required_by,
  ).toContain("alpha");

  mkdirSync(join(repo, "skills", "two"));
  renameSync(join(repo, "skills", "one", "beta"), join(repo, "skills", "two", "beta"));
  makeSkill(join(repo, "skills", "two"), "beta", skillFrontmatter({ name: "beta" }), "beta-v2");
  const newSha = commitAll(repo, "move and change beta");
  const result = run(home, ["update", "alpha", "--json"]);
  expect(result.code).toBe(0);
  expect(result.json().rows.map((row) => row.name)).toEqual(["alpha", "beta"]);
  expect(body("beta")).toContain("beta-v2");
  const beta = readState(home).installations.find((entry) => entry.name === "beta")!;
  expect(beta.source.path).toBe("skills/two/beta");
  expect(beta.resolved_sha).toBe(newSha);
});
