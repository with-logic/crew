/** Failed installs attempt staging cleanup and report retained directories (§7.3). */

import { expect, test } from "bun:test";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { type InstallInput, installSkillIntoAgents } from "../../src/agents/install.ts";
import { CrewError } from "../../src/core/errors.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function installInput(base: string, storePath: string): InstallInput {
  return {
    agents: [{ ...claudeCodeAdapter, userPath: () => base }],
    scope: "user",
    cwd: base,
    storePath,
    skillName: "demo",
    tap: { name: "core", kind: "path", path: storePath, url: "", subpath: "", registered: false },
    tapRelativePath: "demo",
    ref: null,
    resolvedSha: null,
    contentHash: "test-hash",
    force: false,
  };
}

test("a failed source copy removes the staging directory created before reading the source", () => {
  const root = makeTempDir();
  const base = join(root, "agent");
  const input = installInput(base, join(root, "missing-store"));

  expect(() => installSkillIntoAgents(input)).toThrow("ENOENT");
  expect(readdirSync(base)).toEqual([]);
  expect(existsSync(join(base, "demo"))).toBe(false);
});

test("failed cleanup preserves the rename error and identifies retained staging", () => {
  const root = makeTempDir();
  const base = join(root, "agent");
  const store = makeSkill(root, "store", skillFrontmatter({ name: "demo" }));
  const input = installInput(base, store);
  const tap = {
    ...input.tap,
    get name() {
      // Marker construction follows copying; deny the subsequent rename and cleanup.
      chmodSync(base, 0o555);
      return "core";
    },
  };
  let failure: NodeJS.ErrnoException | undefined;
  try {
    installSkillIntoAgents({ ...input, tap });
  } catch (err) {
    failure = err as NodeJS.ErrnoException;
  } finally {
    chmodSync(base, 0o755);
  }

  expect(failure?.code).toBe("EACCES");
  expect(failure?.syscall).toBe("rename");
  expect(failure?.message).toContain(join(base, "demo"));
  const retained = readdirSync(base);
  expect(retained).toHaveLength(1);
  expect(retained[0]).toStartWith(".crew-staging-demo-");
  expect(failure?.message).toContain("could not remove staging directory");
  expect(failure?.message).toContain(join(base, retained[0]!));
  expect(existsSync(join(base, "demo"))).toBe(false);
});

test("failed cleanup preserves a primitive operation failure in CrewError details", () => {
  const root = makeTempDir();
  const base = join(root, "agent");
  const store = makeSkill(root, "store", skillFrontmatter({ name: "demo" }));
  const input = installInput(base, store);
  const original: unknown = "marker construction failed";
  const tap = {
    ...input.tap,
    get name(): string {
      chmodSync(base, 0o555);
      throw original;
    },
  };
  let failure: unknown;
  try {
    installSkillIntoAgents({ ...input, tap });
  } catch (err) {
    failure = err;
  } finally {
    chmodSync(base, 0o755);
  }

  expect(failure).toBeInstanceOf(CrewError);
  const error = failure as CrewError;
  expect(error.code).toBe("usage_error");
  expect(error.details["cause"]).toBe(original);
  expect(error.message).toStartWith(
    "marker construction failed; could not remove staging directory",
  );
  const retained = readdirSync(base);
  expect(retained).toHaveLength(1);
  expect(error.message).toContain(join(base, retained[0]!));
});
