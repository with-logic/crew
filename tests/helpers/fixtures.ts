/**
 * Test fixtures helpers.
 *
 * These helpers construct real on-disk skill directories and real git
 * repos inside a temp directory. We use the real implementation code
 * wherever possible rather than mocking — a fixture fed through the real
 * parse/acquire/install stack is the most faithful test.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig } from "../../src/config/load.ts";
import { paths } from "../../src/core/paths.ts";
import { tapClonePath } from "../../src/core/repo-path.ts";
import { runGit } from "../../src/git/exec.ts";
import { isDirectory, listDir } from "../../src/util/fs.ts";

/** Create a fresh tmp dir unique per call. */
export function makeTempDir(prefix: string = "crew-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Create a directory containing a `SKILL.md` with the given frontmatter body. */
export function makeSkill(
  parentDir: string,
  name: string,
  frontmatter: string,
  body: string = "",
): string {
  const skillDir = join(parentDir, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), `---\n${frontmatter}\n---\n${body}`);
  return skillDir;
}

/** Handy frontmatter builder. */
export function skillFrontmatter(opts: {
  name: string;
  description?: string;
  license?: string;
  compatibility?: string;
  dependencies?: readonly string[];
  homepage?: string;
}): string {
  const lines: string[] = [];
  lines.push(`name: ${opts.name}`);
  lines.push(`description: ${opts.description ?? "A test skill for crew's test suite"}`);
  if (opts.license !== undefined) {
    lines.push(`license: ${opts.license}`);
  }
  if (opts.compatibility !== undefined) {
    lines.push(`compatibility: ${opts.compatibility}`);
  }
  if (opts.homepage !== undefined || (opts.dependencies && opts.dependencies.length > 0)) {
    lines.push("metadata:");
    lines.push("  crew:");
    if (opts.homepage !== undefined) {
      lines.push(`    homepage: ${opts.homepage}`);
    }
    if (opts.dependencies && opts.dependencies.length > 0) {
      lines.push("    dependencies:");
      for (const d of opts.dependencies) {
        lines.push(`      - ${d}`);
      }
    }
  }
  return lines.join("\n");
}

/** Create a git repo at `path`, init, add, commit once. */
export function makeGitRepo(path: string, commitMessage: string = "init"): { sha: string } {
  runGit(["init", "--quiet", "-b", "main", path]);
  runGit(["config", "user.email", "test@example.com"], { cwd: path });
  runGit(["config", "user.name", "Test"], { cwd: path });
  runGit(["config", "commit.gpgsign", "false"], { cwd: path });
  runGit(["add", "."], { cwd: path });
  runGit(["commit", "--quiet", "-m", commitMessage, "--allow-empty"], { cwd: path });
  const result = runGit(["rev-parse", "HEAD"], { cwd: path });
  return { sha: result.stdout.trim() };
}

/** Commit the current state of a git repo; returns the new HEAD SHA. */
export function commitAll(path: string, message: string): string {
  runGit(["add", "-A"], { cwd: path });
  runGit(["commit", "--quiet", "-m", message, "--allow-empty"], { cwd: path });
  return runGit(["rev-parse", "HEAD"], { cwd: path }).stdout.trim();
}

/** Tag the current HEAD. Uses a lightweight, non-signed tag. */
export function tagRepo(path: string, tag: string): void {
  runGit(["-c", "tag.gpgSign=false", "-c", "tag.forceSignAnnotated=false", "tag", tag], {
    cwd: path,
  });
}

/**
 * The clone directory backing a configured tap, looked up by tap name.
 *
 * Clones are keyed by repository URL (§6), so a test can't derive the
 * path from the tap name alone — it has to go through config. Returns
 * null when no tap of that name is configured.
 */
export function cloneDirForTap(tapName: string, home: string): string | null {
  const tap = readConfig(home).taps.find((t) => t.name === tapName);
  if (!tap) return null;
  return tapClonePath(tap, home);
}

/** Every repository clone directory that currently exists under `home`. */
export function cloneDirs(home: string): string[] {
  const dir = paths(home).reposDir;
  if (!isDirectory(dir)) return [];
  return listDir(dir).sort();
}
