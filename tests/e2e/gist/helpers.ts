/**
 * Fixtures for gist sources (§8.2 "Gists", §9 step 5).
 *
 * A gist is only recognised by its host, so these tests must hand crew a
 * real `https://gist.github.com/...` reference — and must not reach the
 * network. `useGistFixture().gist` routes the gist's canonical clone URL
 * to a local repository through the git seam: the reference parser, tap
 * naming, and gist layout all see the real gist URL, while real `git`
 * clones a local `file://` repo. Any other spelling reaching git (a parse
 * that failed to canonicalize, say) is left untouched and trips the
 * network guard.
 */

import { afterEach } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { resetGitRunner, setGitRunner } from "../../../src/git/exec.ts";
import type { TapReexpandRow } from "../../../src/install/tap-reexpand/types.ts";
import { captureStreams } from "../../helpers/env.ts";
import { commitAll, makeGitRepo, skillFrontmatter } from "../../helpers/fixtures.ts";

export const GIST_ID = "7489027d2d93c185f48a628547c043d8";
/** The URL crew records for the gist: owner dropped, `.git` added. */
export const GIST_CLONE_URL = `https://gist.github.com/${GIST_ID}.git`;
/** The URL a browser shows for the gist. */
export const GIST_PAGE_URL = `https://gist.github.com/acme/${GIST_ID}`;
export const GIST_TAP = "gist-7489027d";

/** A gist skill file: frontmatter plus a body, as GitHub stores it. */
export function skillFile(name: string, body = `Body of ${name}.\n`, deps?: string[]): string {
  return `---\n${skillFrontmatter({ name, ...(deps ? { dependencies: deps } : {}) })}\n---\n${body}`;
}

/** Write `files` at the root of `dir` and commit; returns the new HEAD. */
export function writeGistFiles(
  dir: string,
  files: Record<string, string>,
  message = "edit",
): string {
  writeFiles(dir, files);
  return commitAll(dir, message);
}

function writeFiles(dir: string, files: Record<string, string>): void {
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(dir, name), contents);
}

/** What a test gets from `useGistFixture`. */
export interface GistFixture {
  /**
   * Serve a new gist holding `files` at its clone URL — and at any
   * `alsoAt` URLs, for a tap recorded under another spelling. Returns
   * the gist's repo and first commit.
   */
  readonly gist: (
    files: Record<string, string>,
    alsoAt?: readonly string[],
  ) => { dir: string; sha: string };
}

/**
 * Per-test gist serving: `gist(files)` lays out a gist and routes its URL
 * to it. Each test's routing is dropped in `afterEach` by resetting to the
 * network-guarded runner, so a test that serves twice can't leak a route
 * into the next. (Adapters are redirected by each test file itself.)
 */
export function useGistFixture(): GistFixture {
  afterEach(() => resetGitRunner());
  return {
    gist(files, alsoAt = []) {
      const dir = mkdtempSync(join(tmpdir(), "crew-gist-"));
      writeFiles(dir, files);
      const { sha } = makeGitRepo(dir, "gist");
      const served = new Set([GIST_CLONE_URL, ...alsoAt]);
      const previous = setGitRunner((args, options) =>
        previous(
          args.map((a) => (served.has(a) ? `file://${dir}` : a)),
          options,
        ),
      );
      return { dir, sha };
    },
  };
}

/** Run the CLI against `home`, capturing output. */
export function run(
  home: string,
  args: string[],
): { code: number; stdout: string; stderr: string } {
  const cap = captureStreams();
  const code = runCli(args, { home, streams: cap.streams });
  return { code, stdout: cap.stdout(), stderr: cap.stderr() };
}

/** The fields of crew's `--json` output these tests read. */
export interface CliJson {
  readonly error: { name: string; message: string; details: Record<string, unknown> };
  readonly skills: { name: string }[];
  readonly rows: {
    name: string;
    outcome: { kind: string; error?: { code: string; message: string } };
  }[];
  /** `crew update`: rows for a tracked tap's children. */
  readonly tap_reexpand_rows: readonly TapReexpandRow[];
  readonly records: unknown[];
  readonly skipped: { message: string; code: string; path: string }[];
  /** `crew tap add`: the tap as recorded. */
  readonly name: string;
  readonly url: string;
}

/** The `--json` body of a run. */
export function json(r: { stdout: string }): CliJson {
  return JSON.parse(r.stdout) as CliJson;
}
