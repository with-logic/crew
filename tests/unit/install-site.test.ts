/**
 * The install-site rule (§9.2): which of a project-scope entry's install
 * directories crew may delete. Real directories, links, and adapters.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, renameSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import {
  areProjectInstallPathsSafeToRemove,
  type ProjectStateEntry,
} from "../../src/commands/install/manifest/removal/index.ts";
import { withOriginalAdapter } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../helpers/scoped-install.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
let project: string;
beforeEach(() => {
  redirected = redirectClaudeCode();
  project = makeTempDir("crew-proj-");
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

/** A project-scope entry for `name` under `project`, installed for `agents`. */
function entry(name: string, agents: readonly string[] = ["claude-code"]): ProjectStateEntry {
  return {
    name,
    source: { tap: "t", path: name },
    ref: null,
    resolved_sha: null,
    content_hash: "sha256:0",
    scope: "project",
    project_root: project,
    installed_at: "2026-01-01T00:00:00Z",
    agents,
    pinned: false,
    explicit: true,
    required_by: [],
    manifest_owned: true,
  };
}

const skillsDir = (): string => join(project, ".claude", "skills");
const installDir = (name: string): string => join(skillsDir(), name);

describe("areProjectInstallPathsSafeToRemove", () => {
  test("an ordinary directory inside the project is safe", () => {
    mkdirSync(installDir("alpha"), { recursive: true });
    expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(true);
  });

  test("a directory that does not exist is safe: there is nothing to protect", () => {
    expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(true);
  });

  test("a skills directory that is a link out of the project is not safe", () => {
    const elsewhere = makeTempDir("crew-elsewhere-");
    mkdirSync(join(elsewhere, "alpha"));
    mkdirSync(join(project, ".claude"));
    symlinkSync(elsewhere, skillsDir());
    expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(false);
  });

  test("a skill directory that is itself a link is not safe, even to a place inside the project", () => {
    mkdirSync(installDir("real"), { recursive: true });
    symlinkSync(installDir("real"), installDir("alpha"));
    expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(false);
  });

  test("a directory that is also the agent's user-scope install is not safe", () => {
    mkdirSync(installDir("alpha"), { recursive: true });
    // As for a project rooted at the home directory: one path, both scopes.
    (claudeCodeAdapter as { userPath: () => string }).userPath = skillsDir;
    expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(false);
  });

  test("a directory that is another agent's user-scope install, by a second path, is not safe", () => {
    mkdirSync(installDir("alpha"), { recursive: true });
    const alias = join(makeTempDir("crew-alias-"), "skills");
    symlinkSync(skillsDir(), alias);
    const codexUserPath = codexAdapter.userPath;
    (codexAdapter as { userPath: () => string }).userPath = () => alias;
    try {
      expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(false);
    } finally {
      (codexAdapter as { userPath: () => string }).userPath = codexUserPath;
    }
  });

  test.each(["../../victim", "a/b", "", "Alpha"])(
    "a name that is not a single skill-name segment is not safe: %p",
    (name) => {
      mkdirSync(join(project, "victim"));
      expect(areProjectInstallPathsSafeToRemove(entry(name))).toBe(false);
    },
  );

  test("a project root that is not an absolute path is not safe", () => {
    mkdirSync(installDir("alpha"), { recursive: true });
    for (const root of [".", "relative/dir", ""]) {
      expect(areProjectInstallPathsSafeToRemove({ ...entry("alpha"), project_root: root })).toBe(
        false,
      );
    }
  });

  test("a directory that cannot be inspected is not safe: unreadable is not the same as absent", () => {
    mkdirSync(installDir("alpha"), { recursive: true });
    chmodSync(join(project, ".claude"), 0);
    try {
      expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(false);
    } finally {
      chmodSync(join(project, ".claude"), 0o700);
    }
  });

  test("an install directory that is simply outside the project, with no link involved, is not safe", () => {
    const outside = makeTempDir("crew-outside-");
    mkdirSync(join(outside, "alpha"));
    (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = () => outside;
    expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(false);
  });

  test("an entry with no agent, or an agent this build does not know, is not safe", () => {
    mkdirSync(installDir("alpha"), { recursive: true });
    expect(areProjectInstallPathsSafeToRemove(entry("alpha", []))).toBe(false);
    expect(areProjectInstallPathsSafeToRemove(entry("alpha", ["ghost-agent"]))).toBe(false);
  });

  test("an agent with no project-scope directory is not safe", () => {
    // A base of "" would resolve relative to the working directory.
    mkdirSync(join(project, "alpha"));
    const safe = withOriginalAdapter("nanobot", () =>
      areProjectInstallPathsSafeToRemove(entry("alpha", ["nanobot"])),
    );
    expect(safe).toBe(false);
  });

  test("one unsafe agent directory makes the whole entry unsafe", () => {
    mkdirSync(installDir("alpha"), { recursive: true });
    const outside = makeTempDir("crew-outside-");
    mkdirSync(join(project, ".codex"));
    const codex = { project: codexAdapter.projectPath, user: codexAdapter.userPath };
    (codexAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
      join(c, ".codex", "skills");
    (codexAdapter as { userPath: () => string }).userPath = () => makeTempDir("crew-co-");
    mkdirSync(join(outside, "alpha"));
    symlinkSync(outside, join(project, ".codex", "skills"));
    try {
      expect(areProjectInstallPathsSafeToRemove(entry("alpha", ["claude-code", "codex"]))).toBe(
        false,
      );
    } finally {
      (codexAdapter as { projectPath: (c: string) => string }).projectPath = codex.project;
      (codexAdapter as { userPath: () => string }).userPath = codex.user;
    }
  });

  test("renaming the skills directory away and linking it back makes it unsafe", () => {
    mkdirSync(installDir("alpha"), { recursive: true });
    expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(true);
    const moved = join(makeTempDir("crew-moved-"), "skills");
    renameSync(skillsDir(), moved);
    symlinkSync(moved, skillsDir());
    expect(areProjectInstallPathsSafeToRemove(entry("alpha"))).toBe(false);
  });
});
