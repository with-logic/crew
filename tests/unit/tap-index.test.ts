/**
 * Unit tests for `tap-index.ts` — the shallow index of a tap's layout.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TapConfig } from "../../src/core/types.ts";
import { indexTap } from "../../src/install/tap-index.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function pathTap(path: string, name = "t"): TapConfig {
  return {
    name,
    kind: "path",
    registered: true,
    url: "",
    subpath: "",
    path,
  };
}

describe("indexTap", () => {
  test("single-skill root: indexes declared skill name", () => {
    const tmp = makeTempDir("ti-root-");
    writeFileSync(
      join(tmp, "SKILL.md"),
      `---\n${skillFrontmatter({ name: "declared-root" })}\n---\n`,
    );
    const idx = indexTap(pathTap(tmp), "/unused");
    expect([...idx.skills.keys()]).toEqual(["declared-root"]);
    expect(idx.skills.get("declared-root")![0]!.tapRelativePath).toBe("");
    expect(idx.namespaces.size).toBe(0);
  });

  test("skills/ flat: each child is a skill, no namespaces", () => {
    const root = makeTempDir("ti-flat-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    makeSkill(skillsDir, "alpha", skillFrontmatter({ name: "alpha" }));
    makeSkill(skillsDir, "beta", skillFrontmatter({ name: "beta" }));

    const idx = indexTap(pathTap(root), "/unused");
    expect([...idx.skills.keys()].sort()).toEqual(["alpha", "beta"]);
    expect(idx.namespaces.size).toBe(0);
    expect(idx.skills.get("alpha")![0]!.tapRelativePath).toBe("skills/alpha");
  });

  test("skills/ flat: index uses declared skill names, not directory names", () => {
    const root = makeTempDir("ti-declared-name-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    makeSkill(
      skillsDir,
      "firebase-data-connect-basics",
      skillFrontmatter({ name: "firebase-data-connect" }),
    );
    makeSkill(skillsDir, "numeric", skillFrontmatter({ name: "3-statement-model" }));

    const idx = indexTap(pathTap(root), "/unused");
    expect([...idx.skills.keys()].sort()).toEqual(["3-statement-model", "firebase-data-connect"]);
    expect(idx.skills.get("firebase-data-connect")![0]!.tapRelativePath).toBe(
      "skills/firebase-data-connect-basics",
    );
  });

  test("skills/ flat: invalid child frontmatter is skipped", () => {
    const root = makeTempDir("ti-invalid-name-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    makeSkill(skillsDir, "bad", skillFrontmatter({ name: "Bad" }));
    makeSkill(skillsDir, "good", skillFrontmatter({ name: "good" }));

    const idx = indexTap(pathTap(root), "/unused");
    expect([...idx.skills.keys()]).toEqual(["good"]);
  });

  test("skills/ with namespace dir: skill + namespace indexed", () => {
    const root = makeTempDir("ti-ns-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    const marketing = join(skillsDir, "marketing");
    mkdirSync(marketing);
    makeSkill(marketing, "email-outreach", skillFrontmatter({ name: "email-outreach" }));
    makeSkill(marketing, "social-posts", skillFrontmatter({ name: "social-posts" }));

    const idx = indexTap(pathTap(root), "/unused");
    expect([...idx.skills.keys()].sort()).toEqual(["email-outreach", "social-posts"]);
    expect([...idx.namespaces.keys()]).toEqual(["marketing"]);
    expect(idx.namespaces.get("marketing")!.length).toBe(2);
    const email = idx.skills.get("email-outreach")![0]!;
    expect(email.namespace).toBe("marketing");
    expect(email.tapRelativePath).toBe("skills/marketing/email-outreach");
  });

  test("skills/ with non-dir child: skipped", () => {
    // Exercises the `!isDirectory(child)` branch.
    const root = makeTempDir("ti-nondir-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    writeFileSync(join(skillsDir, "README.md"), "# readme");
    makeSkill(skillsDir, "real", skillFrontmatter({ name: "real" }));

    const idx = indexTap(pathTap(root), "/unused");
    expect([...idx.skills.keys()]).toEqual(["real"]);
  });

  test("skills/ with empty namespace dir (no skill children): ignored", () => {
    const root = makeTempDir("ti-empty-ns-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    mkdirSync(join(skillsDir, "docs")); // no SKILL.md, no children
    makeSkill(skillsDir, "real", skillFrontmatter({ name: "real" }));

    const idx = indexTap(pathTap(root), "/unused");
    expect([...idx.skills.keys()]).toEqual(["real"]);
    expect(idx.namespaces.size).toBe(0);
  });

  test("fallback: walk root one level deep when no skills/ dir", () => {
    const root = makeTempDir("ti-flat-root-");
    makeSkill(root, "direct", skillFrontmatter({ name: "direct" }));

    const idx = indexTap(pathTap(root), "/unused");
    expect([...idx.skills.keys()]).toEqual(["direct"]);
    expect(idx.skills.get("direct")![0]!.tapRelativePath).toBe("direct");
  });

  test("namespace dir with non-dir child: skipped", () => {
    const root = makeTempDir("ti-ns-nondir-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    const marketing = join(skillsDir, "marketing");
    mkdirSync(marketing);
    writeFileSync(join(marketing, "README.md"), "# mkt");
    makeSkill(marketing, "real", skillFrontmatter({ name: "real" }));

    const idx = indexTap(pathTap(root), "/unused");
    expect([...idx.skills.keys()]).toEqual(["real"]);
  });

  test("fallback: non-dir children skipped", () => {
    const root = makeTempDir("ti-fall-nondir-");
    writeFileSync(join(root, "README.md"), "readme");
    makeSkill(root, "one", skillFrontmatter({ name: "one" }));

    const idx = indexTap(pathTap(root), "/unused");
    expect([...idx.skills.keys()]).toEqual(["one"]);
  });

  test("same skill name in two namespaces: both listed", () => {
    const root = makeTempDir("ti-same-name-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    for (const ns of ["marketing", "engineering"]) {
      mkdirSync(join(skillsDir, ns));
      makeSkill(join(skillsDir, ns), "copy-review", skillFrontmatter({ name: "copy-review" }));
    }
    const idx = indexTap(pathTap(root), "/unused");
    expect(idx.skills.get("copy-review")!.length).toBe(2);
    expect([...idx.namespaces.keys()].sort()).toEqual(["engineering", "marketing"]);
  });
});
