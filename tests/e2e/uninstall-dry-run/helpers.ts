/**
 * Shared fixture for the `crew uninstall --dry-run` suites (§7.4).
 *
 * Both adapters are redirected at temp roots so a dry run can be
 * observed against two physical install targets, which is what proves
 * "writes nothing" rather than "writes nothing to the first agent".
 */

import { afterEach, beforeEach } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

/** Claude Code's redirected user root for the current test. */
export let ccRoot: string;
/** Codex's redirected user root for the current test. */
export let coRoot: string;

let originals: {
  cc: { user: () => string; detect: () => boolean };
  co: { user: () => string; detect: () => boolean };
};

/**
 * Redirect both adapters at fresh temp roots, restoring the real
 * implementations afterwards. Call at the top of each suite.
 */
export function useRedirectedAdapters(): void {
  beforeEach(() => {
    ccRoot = makeTempDir("crew-cc-");
    coRoot = makeTempDir("crew-co-");
    originals = {
      cc: { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
      co: { user: codexAdapter.userPath, detect: codexAdapter.detect },
    };
    (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
    (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
    (codexAdapter as { detect: () => boolean }).detect = () => true;
  });
  afterEach(() => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.user;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.detect;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.user;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.detect;
  });
}

/** Point Codex at Claude Code's root so both share one install dest (§7.2). */
export function shareOneDest(): void {
  (codexAdapter as { userPath: () => string }).userPath = () => ccRoot;
}

/** Install `foo` (which depends on `bar`) from a local path source. */
export function installFooWithDepBar(home: string): void {
  const src = makeTempDir();
  makeSkill(src, "bar", skillFrontmatter({ name: "bar" }));
  makeSkill(src, "foo", skillFrontmatter({ name: "foo", dependencies: [join(src, "bar")] }));
  runCli(["install", join(src, "foo")], { home, streams: captureStreams().streams });
}
