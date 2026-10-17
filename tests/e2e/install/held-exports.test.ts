/**
 * Dependencies read at many commits (§9 steps 3 and 6; C-INST-27): every
 * parent's siblings are read at its own commit, but only the few commits
 * read most recently are held as exports at once (`MAX_HELD_EXPORTS`); one
 * let go is exported again when a later parent needs it, and the install
 * still finds every sibling.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { relative, sep } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { setGitRunner } from "../../../src/git/exec.ts";
import { MAX_HELD_EXPORTS } from "../../../src/install/resolve/dep/parent-tree.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
  tagRepo,
} from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

/** More commits than are held at once. */
const COMMITS = MAX_HELD_EXPORTS + 2;

/**
 * A repository tagged `v1`…`vN`; at `vI` it gains `pI` → `sI` → `tI`, each
 * depending on the next by bare name, so `pI` and `sI` both read siblings
 * at that commit.
 */
function chainedRepo(): string {
  const repo = makeTempDir("crew-held-");
  for (let i = 1; i <= COMMITS; i++) {
    makeSkill(repo, `p${i}`, skillFrontmatter({ name: `p${i}`, dependencies: [`s${i}`] }));
    makeSkill(repo, `s${i}`, skillFrontmatter({ name: `s${i}`, dependencies: [`t${i}`] }));
    makeSkill(repo, `t${i}`, skillFrontmatter({ name: `t${i}` }));
    if (i === 1) makeGitRepo(repo);
    else commitAll(repo, `add chain ${i}`);
    tagRepo(repo, `v${i}`);
  }
  return repo;
}

test("C-INST-27 siblings read at many commits hold only a few exports at once, and all install", () => {
  const repo = chainedRepo();
  const home = makeCrewHome();
  expect(
    runCli(["tap", "add", `file://${repo}`, "acme"], { home, streams: captureStreams().streams }),
  ).toBe(0);
  const scratch = paths(home).gitCacheDir;
  let mostHeld = 0;
  const exportsOf = new Map<string, number>();
  const served = setGitRunner((args, options) => {
    const workTree = args.find((a) => a.startsWith("--work-tree="));
    if (workTree) {
      // The exports already there as this one starts.
      const starting = relative(scratch, workTree.slice("--work-tree=".length)).split(sep)[0];
      const held = existsSync(scratch) ? readdirSync(scratch).filter((n) => n !== starting) : [];
      mostHeld = Math.max(mostHeld, held.length);
      const sha = args[args.indexOf("checkout") + 1]!;
      exportsOf.set(sha, (exportsOf.get(sha) ?? 0) + 1);
    }
    return served(args, options);
  });

  const refs = Array.from({ length: COMMITS }, (_, i) => `acme/p${i + 1}@v${i + 1}`);
  expect(runCli(["install", ...refs], { home, streams: captureStreams().streams })).toBe(0);

  const names = (letter: string) => Array.from({ length: COMMITS }, (_, i) => `${letter}${i + 1}`);
  const installed = readState(home)
    .installations.map((e) => e.name)
    .sort();
  expect(installed).toEqual([...names("p"), ...names("s"), ...names("t")].sort());
  expect(readdirSync(claude.userRoot).sort()).toEqual(installed);
  // Held all at once, the last export would start beside five others.
  expect(mostHeld).toBe(MAX_HELD_EXPORTS);
  // Each commit: two reads of its root (the tap at the ref, then the
  // skill), its parent's siblings, and — let go before the sibling's own
  // dependency was read — those siblings again.
  expect([...exportsOf.values()]).toEqual(new Array(COMMITS).fill(4));
  expect(existsSync(scratch) ? readdirSync(scratch) : []).toEqual([]);
}, 30_000);
