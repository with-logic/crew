/** Real directory repositories and export observations for dependency walks (§9 steps 3, 6). */

import { existsSync } from "node:fs";
import { readConfig } from "../../../../src/config/load.ts";
import { setGitRunner } from "../../../../src/git/exec.ts";
import { enqueueTapRef } from "../../../../src/install/resolve/enqueue.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../../helpers/fixtures.ts";

/** Observe exports while delegating every command to real local git. */
export function captureExports() {
  const roots: string[] = [];
  const alive: number[] = [];
  const previous = setGitRunner((args, options) => {
    const result = previous(args, options);
    const worktree = args.find((arg) => arg.startsWith("--work-tree="));
    if (worktree !== undefined) {
      roots.push(worktree.slice("--work-tree=".length));
      alive.push(roots.filter((root) => existsSync(root)).length);
    }
    return result;
  });
  return { roots, alive };
}

/** Each revision gives the dependency a distinct name and visibly distinct bytes. */
export function revisionSkills(repo: string, revision: number): string {
  makeSkill(
    repo,
    `parent-${revision}`,
    skillFrontmatter({ name: `parent-${revision}`, dependencies: [`dep-${revision}`] }),
  );
  return makeSkill(
    repo,
    "dependency",
    skillFrontmatter({ name: `dep-${revision}` }),
    `revision ${revision}\n`,
  );
}

/** Four revisions whose roots can all coexist in one install set. */
export function revisions() {
  const repo = makeTempDir("crew-dependency-cache-repo-");
  revisionSkills(repo, 0);
  const { sha } = makeGitRepo(repo);
  const shas = [sha];
  for (let i = 1; i < 4; i++) {
    revisionSkills(repo, i);
    shas.push(commitAll(repo, `revision ${i}`));
  }
  const home = makeCrewHome();
  const config = {
    ...readConfig(home),
    taps: [
      {
        name: "local",
        kind: "git" as const,
        registered: true,
        url: `file://${repo}`,
        subpath: "",
        path: "",
      },
    ],
  };
  return { home, shas, config, url: `file://${repo}` };
}

/** Use production root acquisition to prepare parents before observing dependency exports. */
export function revisionParents(fixture: ReturnType<typeof revisions>) {
  return fixture.shas.map(
    (sha, i) =>
      enqueueTapRef(
        { tap: "local", namespace: null, name: `parent-${i}`, ref: sha },
        fixture.config,
        fixture.home,
        true,
        null,
      ).items[0]!,
  );
}
