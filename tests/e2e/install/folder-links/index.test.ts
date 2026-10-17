/**
 * Folder links in tap indexing (§9 step 5 "Folder links", §10.1.1;
 * C-SPEC-17, C-UPD-18c): a folder that leads out of the repository is
 * never read — even one crew could read. `crew search` leaves it out, a
 * `<tap>/<skill>` reference to it (or below it) fails naming the refusal,
 * and re-expansion on `crew update` reports it as a failed new child; one
 * linked inside the repository is kept.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TapReexpandRow } from "../../../../src/install/tap-reexpand/types.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { commitAll, makeTempDir } from "../../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, gitRepo, link, outsideSkill, searched, skillAt } from "./helpers.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** The part of `crew update --json` these tests read. */
interface UpdateJson {
  readonly tap_reexpand_rows: readonly TapReexpandRow[];
}

/** A home with `repo` added as the registered tap `mine`; throws when it can't be added. */
function withTap(repo: string): string {
  const home = makeCrewHome();
  const added = crew(home, ["tap", "add", `file://${repo}`, "mine"]);
  if (added.code !== 0) throw new Error(`crew tap add failed: ${added.out}`);
  return home;
}

test("C-SPEC-17 C-REF-40 the tap index leaves out skill and namespace-child folders linked out, and references to them name why", () => {
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    skillAt(join(r, "skills", "team"), "x");
    skillAt(join(r, "shared"), "alias");
    link(join("..", "shared", "alias"), join(r, "skills", "alias"));
    link(outsideSkill("evil", true), join(r, "skills", "evil"));
    link(outsideSkill("bad", true), join(r, "skills", "team", "bad"));
    // A whole namespace linked out.
    link(dirname(outsideSkill("deploy", true)), join(r, "skills", "ops"));
  });
  const home = withTap(repo);
  expect(searched(home, "mine")).toEqual({ names: ["alias", "good", "x"], warnings: [] });
  for (const ref of ["mine/evil", "mine/team/bad", "mine/ops/deploy"]) {
    const refused = crew(home, ["install", ref]);
    expect(refused.code).toBe(4);
    expect(refused.out).toContain("leads out of the repository");
  }
  expect(readdirSync(claude.userRoot)).toEqual([]);
  expect(crew(home, ["install", "mine/alias"]).code).toBe(0);
  expect(readdirSync(claude.userRoot)).toEqual(["alias"]);
});

test("C-SPEC-17 at a tap's root, the index leaves out a skill folder linked out", () => {
  const repo = gitRepo((r) => {
    skillAt(r, "good");
    link(outsideSkill("evil", true), join(r, "evil"));
  });
  expect(searched(withTap(repo), "mine")).toEqual({ names: ["good"], warnings: [] });
});

test("C-SPEC-17 the tap index never lists a `skills/` linked out, even one crew can't list", () => {
  const outside = makeTempDir("crew-outside-");
  skillAt(outside, "evil");
  const repo = gitRepo((r) => link(outside, join(r, "skills")));
  const home = withTap(repo);
  chmodSync(outside, 0o000);
  try {
    expect(searched(home, "mine")).toEqual({ names: [], warnings: [] });
    // A skill below it is refused with it, not just missing.
    const refused = crew(home, ["install", "mine/evil"]);
    expect([refused.code, refused.out.includes("leads out of the repository")]).toEqual([4, true]);
  } finally {
    chmodSync(outside, 0o755);
  }
});

test("C-SPEC-17 C-UPD-18c re-expansion on update reports a new child linked out of the repository, never installing it", () => {
  const repo = gitRepo((r) => skillAt(join(r, "skills"), "good"));
  const home = withTap(repo);
  expect(crew(home, ["install", "mine"]).code).toBe(0);
  skillAt(join(repo, "shared"), "alias");
  link(join("..", "shared", "alias"), join(repo, "skills", "alias"));
  link(outsideSkill("evil", true), join(repo, "skills", "evil"));
  commitAll(repo, "add alias and evil");

  const r = crew(home, ["update", "--json"]);
  expect(r.code).toBe(1);
  const rows = (JSON.parse(r.out) as UpdateJson).tap_reexpand_rows.map(
    (row) => `${row.name}:${row.kind}:${row.error?.code ?? ""}`,
  );
  expect(rows.sort()).toEqual(["alias:added:", "skills/evil:tap_error:invalid_skill"]);
  expect(readdirSync(claude.userRoot).sort()).toEqual(["alias", "good"]);
});
