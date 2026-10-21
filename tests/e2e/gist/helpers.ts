/** Local git transport for gist integration tests (§8.2, §9; C-GIST). */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { setGitRunner } from "../../../src/git/exec.ts";
import { makeGitRepo, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

export const GIST_URL = "https://gist.github.com/crew-test/0123456789abcdef";

export function gistFile(name: string, body = name, dependencies: readonly string[] = []): string {
  return `---\n${skillFrontmatter({ name, dependencies })}\n---\n${body}\n`;
}

export function makeGist(files: Readonly<Record<string, string>>): { repo: string; sha: string } {
  const repo = makeTempDir("crew-gist-");
  for (const [file, bytes] of Object.entries(files)) writeFileSync(join(repo, file), bytes);
  const { sha } = makeGitRepo(repo);
  const previous = setGitRunner((args, options) =>
    previous(
      args.map((arg) => (arg === GIST_URL ? `file://${repo}` : arg)),
      options,
    ),
  );
  return { repo, sha };
}
