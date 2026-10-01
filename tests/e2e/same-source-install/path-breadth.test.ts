/**
 * C-INST-13b / C-INST-13h for PATH taps (§5.4, §16.5).
 *
 * Breadth comparison has two branches: git taps compare canonical repo
 * URLs, path taps compare directories. The git branch is covered by
 * `reattribution.test.ts` and `attribution-kept.test.ts`; this suite
 * covers the path branch end to end, in both directions.
 *
 * Child to parent: installing the containing directory re-attributes the
 * entry onto the wider tap and collects the emptied narrow one. Parent to
 * child: a whole-directory subscription is never narrowed onto one of its
 * subdirectories, because the wider row is what re-expansion walks to
 * discover siblings (§10.1.1).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { type AdapterRedirect, install, redirectClaudeCode } from "./helpers.ts";

let cc: AdapterRedirect;

beforeEach(() => {
  cc = redirectClaudeCode();
});
afterEach(() => {
  cc.restore();
});

/**
 * A plain directory (no git) holding `skills/<name>/SKILL.md` for each
 * name. Path taps point at directories, so this is the path-branch
 * analogue of `buildRepo`.
 */
function buildDir(names: readonly string[]): string {
  const root = makeTempDir("crew-pathsrc-");
  for (const n of names) {
    makeSkill(join(root, "skills"), n, skillFrontmatter({ name: n, description: `${n} skill` }));
  }
  return root;
}

describe("C-INST-13j path-tap breadth", () => {
  test("C-INST-13j installing the parent directory re-attributes the child", () => {
    const home = makeCrewHome();
    const root = buildDir(["docx", "pdf"]);

    // Narrow first: the skill directory itself.
    const first = install(home, join(root, "skills", "docx"));
    expect(first.code).toBe(0);
    const narrowTap = readState(home).installations.find((e) => e.name === "docx")!.source.tap;

    // Then the directory containing it. Same canonical location, so the
    // entry moves onto the wider row rather than conflicting.
    const second = install(home, root);
    expect(second.code).toBe(0);
    expect(second.out).toContain("now tracked via");

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    expect(entry.source.tap).not.toBe(narrowTap);
    expect(entry.source.path).toBe("skills/docx");

    // The emptied auto tap is dropped from config. A path tap owns no
    // clone directory, so there is nothing on disk to delete.
    expect(readConfig(home).taps.some((t) => t.name === narrowTap)).toBe(false);
    expect(existsSync(join(root, "skills", "docx"))).toBe(true);
  });

  test("C-INST-13h a whole-directory subscription is not narrowed onto a subdirectory", () => {
    const home = makeCrewHome();
    const root = buildDir(["docx", "pdf"]);

    // Wide first: this subscribes the user to the directory's children.
    const first = install(home, root);
    expect(first.code).toBe(0);
    const wideTap = readState(home).installations.find((e) => e.name === "docx")!.source.tap;

    // Now the child alone. Moving onto it would lose the sibling
    // subscription, so attribution must stay put.
    const second = install(home, join(root, "skills", "docx"));
    expect(second.code).toBe(0);

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    expect(entry.source.tap).toBe(wideTap);
    expect(entry.source.path).toBe("skills/docx");
    // The wide tap still owns both children, so re-expansion still sees
    // `pdf` as a sibling.
    expect(readConfig(home).taps.some((t) => t.name === wideTap)).toBe(true);
  });
});
