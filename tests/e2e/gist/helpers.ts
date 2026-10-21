/** Real local git fixtures retaining public gist URLs (§9 gist layout). */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { runGit, setGitRunner } from "../../../src/git/exec.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { commitAll, makeGitRepo, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

export const GIST_URL = "https://gist.github.com/test-owner/abc123";
export function gistFile(repo: string, filename: string, name: string, dependencies?: string[]) {
  const raw = `---\n${skillFrontmatter({ name, ...(dependencies ? { dependencies } : {}) })}\n---\nOriginal ${name}\n`;
  writeFileSync(join(repo, filename), raw);
  return raw;
}
export function gistFixture(
  files: Record<string, string> = { "prd.md": "prd", "build.txt": "build" },
) {
  const repo = makeTempDir("crew-gist-");
  for (const [filename, name] of Object.entries(files)) gistFile(repo, filename, name);
  makeGitRepo(repo);
  runGit(["config", "core.excludesfile", "/dev/null"], { cwd: repo });
  const sha = commitAll(repo, "gist files");
  const previous = setGitRunner((args, options) =>
    previous(
      args.map((arg) => (arg === GIST_URL ? `file://${repo}` : arg)),
      options,
    ),
  );
  const home = makeCrewHome();
  const cli = (...args: string[]) => {
    const capture = captureStreams();
    const code = runCli(args, { home, streams: capture.streams });
    return { code, out: capture.stdout(), err: capture.stderr() };
  };
  return { repo, sha, home, cli };
}
