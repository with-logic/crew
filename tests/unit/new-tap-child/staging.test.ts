/** Snapshot failure keeps its error when staging cleanup also fails (§10.1.1). */

import { afterEach, expect, test } from "bun:test";
import { chmodSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { installSkillIntoAgents } from "../../../src/agents/install.ts";
import { hashDirectory } from "../../../src/hash/content.ts";
import { ChildReplacement } from "../../../src/install/new-tap-child/replacement.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const original = claudeCodeAdapter.userPath;
afterEach(() => {
  claudeCodeAdapter.userPath = original;
});

test("C-UPD-38 failed staging cleanup preserves the primary snapshot error", () => {
  const root = makeTempDir();
  claudeCodeAdapter.userPath = () => root;
  const source = makeSkill(
    makeTempDir(),
    "newbie",
    skillFrontmatter({ name: "newbie" }),
    "new bytes",
  );
  const dest = makeSkill(root, "newbie", skillFrontmatter({ name: "newbie" }), "prior bytes");
  const replacement = new ChildReplacement(dest);
  let error: Error | null = null;
  try {
    installSkillIntoAgents({
      agents: [claudeCodeAdapter],
      scope: "user",
      cwd: root,
      storePath: source,
      skillName: "newbie",
      tap: { name: "fixture", kind: "path", path: source, url: "", subpath: "", registered: true },
      tapRelativePath: "newbie",
      ref: null,
      resolvedSha: null,
      contentHash: hashDirectory(source),
      force: true,
      beforeReplace: () => {
        chmodSync(root, 0o555);
        replacement.moveAsideForReplacement();
      },
    });
  } catch (err) {
    error = err as Error;
  } finally {
    chmodSync(root, 0o755);
  }
  expect(error?.message).toContain("EACCES");
  const staging = readdirSync(root).filter((name) => name.startsWith(".crew-staging-"));
  expect(staging).toHaveLength(1);
  expect(error?.message).toContain("could not remove staging directory");
  expect(error?.message).toContain(join(root, staging[0]!));
  expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toContain("prior bytes");
});
