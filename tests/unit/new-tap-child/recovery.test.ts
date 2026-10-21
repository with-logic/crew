/** Child-level failures report retained backups after failed restoration (§10.1.1). */

import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { installNewTapChild } from "../../../src/install/new-tap-child/index.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

const originalClaude = claudeCodeAdapter.userPath;
const originalCodex = codexAdapter.userPath;
afterEach(() => {
  claudeCodeAdapter.userPath = originalClaude;
  codexAdapter.userPath = originalCodex;
});

test("C-UPD-38 failed restoration reports recovery data while rolling back healthy targets", () => {
  const root = makeTempDir();
  const codexRoot = makeTempDir();
  claudeCodeAdapter.userPath = () => root;
  codexAdapter.userPath = () => codexRoot;
  const prior = makeSkill(root, "newbie", skillFrontmatter({ name: "newbie" }), "prior bytes");
  const locked = join(prior, "locked");
  mkdirSync(locked);
  writeFileSync(join(locked, "asset"), "prior asset");
  const source = makeSkill(
    makeTempDir(),
    "newbie",
    skillFrontmatter({ name: "newbie" }),
    "new bytes",
  );
  chmodSync(locked, 0o555);
  let error: CrewError | null = null;
  try {
    installNewTapChild(
      {
        skillDir: source,
        skillName: "newbie",
        tapRelativePath: "newbie",
        scope: "user",
        tap: {
          name: "fixture",
          kind: "path",
          path: source,
          registered: true,
          url: "",
          subpath: "",
        },
        agents: ["claude-code", "codex"],
        resolvedSha: "new-sha",
        projectRoot: null,
        ref: null,
        pinned: false,
      },
      true,
      makeCrewHome(),
      root,
    );
  } catch (err) {
    expect(err).toBeInstanceOf(CrewError);
    error = err as CrewError;
  } finally {
    chmodSync(locked, 0o755);
  }
  expect(error?.code).toBe("usage_error");
  expect(error?.message).toContain("claude-code");
  expect(error?.message).toContain("rollback");
  expect(error?.message).toContain("prior copy retained at");
  const backup = readdirSync(root).find((name) => name.startsWith(".crew-rollback-"))!;
  const recovery = join(root, backup, "prior");
  expect(error?.message).toContain(recovery);
  expect(readFileSync(join(recovery, "SKILL.md"), "utf8")).toContain("prior bytes");
  expect(readFileSync(join(recovery, "locked", "asset"), "utf8")).toBe("prior asset");
  expect(existsSync(join(codexRoot, "newbie"))).toBe(false);
  chmodSync(join(recovery, "locked"), 0o755);
});
