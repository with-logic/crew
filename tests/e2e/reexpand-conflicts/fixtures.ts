/** Local git and CLI fixtures for re-expansion source conflicts (§5.4, §10.1.1). */

import { runCli } from "../../../src/cli/main.ts";
import { captureStreams } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

export function invoke(home: string, args: string[], cwd: string) {
  const cap = captureStreams();
  const code = runCli(args, { home, cwd, streams: cap.streams });
  return { code, stdout: cap.stdout(), stderr: cap.stderr() };
}

export function createTap(name: string, child: string): string {
  const repo = makeTempDir("crew-conflict-repo-");
  makeSkill(repo, child, skillFrontmatter({ name: child }), `${name} bytes\n`);
  makeGitRepo(repo);
  return repo;
}

export function addShared(repo: string, body: string): void {
  makeSkill(repo, "shared", skillFrontmatter({ name: "shared" }), body);
  commitAll(repo, "add shared child");
}
