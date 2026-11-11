/**
 * `remoteCommitOf` (§9.3): what a branch, a tag, or the default branch of
 * a remote names right now. Real local repositories over `file://`.
 */

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { runGit, setGitRunner } from "../../src/git/exec.ts";
import { remoteCommitOf } from "../../src/git/repo/remote.ts";
import { displayUrl } from "../../src/refs/display-url.ts";
import { commitAll, makeGitRepo, makeTempDir, tagRepo } from "../helpers/fixtures.ts";

/** A repository with one commit; returns its directory, `file://` URL, and that commit. */
function makeRepo(): { dir: string; url: string; first: string } {
  const dir = makeTempDir("crew-remote-");
  writeFileSync(join(dir, "a.txt"), "one\n");
  const { sha } = makeGitRepo(dir);
  return { dir, url: `file://${dir}`, first: sha };
}

function git(dir: string, ...args: string[]): string {
  return runGit(args, { cwd: dir }).stdout.trim();
}

describe("remoteCommitOf", () => {
  test("no ref is the default branch's current commit, whatever that branch is called", () => {
    const { dir, url, first } = makeRepo();
    git(dir, "branch", "-m", "trunk");
    expect(remoteCommitOf(url, null)).toBe(first);

    const second = commitAll(dir, "more");
    expect(remoteCommitOf(url, null)).toBe(second);
  });

  test("it asks with one ls-remote and neither clones nor fetches", () => {
    const { url, first } = makeRepo();
    const commands: string[] = [];
    const real = setGitRunner((args, options) => {
      commands.push(args.join(" "));
      return real(args, options);
    });
    try {
      expect(remoteCommitOf(url, "main")).toBe(first);
    } finally {
      setGitRunner(real);
    }

    expect(commands).toEqual([
      `ls-remote -- ${url} refs/tags/main^{} refs/tags/main refs/heads/main`,
    ]);
  });

  test("a failure to run git at all is passed on, not reported as an unreachable remote", () => {
    const { url } = makeRepo();
    const real = setGitRunner(() => {
      throw new Error("spawn git ENOENT");
    });
    try {
      expect(() => remoteCommitOf(url, null)).toThrow("spawn git ENOENT");
    } finally {
      setGitRunner(real);
    }
  });

  test("a branch is that branch's current commit, not the default branch's", () => {
    const { dir, url, first } = makeRepo();
    const main = git(dir, "branch", "--show-current");
    git(dir, "checkout", "-q", "-b", "next");
    const onNext = commitAll(dir, "more");
    git(dir, "checkout", "-q", main);

    expect(remoteCommitOf(url, "next")).toBe(onNext);
    expect(remoteCommitOf(url, main)).toBe(first);
  });

  test("a lightweight tag is the commit it names", () => {
    const { dir, url, first } = makeRepo();
    tagRepo(dir, "v1.0.0");
    commitAll(dir, "more");

    expect(remoteCommitOf(url, "v1.0.0")).toBe(first);
  });

  test("an annotated tag is the commit it points at, not the tag object", () => {
    const { dir, url, first } = makeRepo();
    git(dir, "tag", "-a", "v2.0.0", "-m", "two");
    expect(git(dir, "rev-parse", "v2.0.0")).not.toBe(first);

    expect(remoteCommitOf(url, "v2.0.0")).toBe(first);
  });

  test("a tag wins over a branch of the same name", () => {
    const { dir, url, first } = makeRepo();
    tagRepo(dir, "stable");
    const main = git(dir, "branch", "--show-current");
    git(dir, "checkout", "-q", "-b", "stable");
    commitAll(dir, "more");
    git(dir, "checkout", "-q", main);

    expect(remoteCommitOf(url, "stable")).toBe(first);
  });

  test("a name that is only a prefix or suffix of a real ref is not found", () => {
    const { dir, url } = makeRepo();
    git(dir, "branch", "release/next");

    expect(remoteCommitOf(url, "next")).toBeNull();
    expect(remoteCommitOf(url, "release")).toBeNull();
  });

  test.each(["rel*", "*", "ma?n", "[m]ain", "ma\\in"])(
    "%s has a pattern character, so it names nothing and is not sent to the remote",
    (name) => {
      // Nothing is at this URL: asking it anything would be `source_unreachable`.
      const url = `file://${join(makeTempDir("crew-remote-"), "missing")}`;

      expect(remoteCommitOf(url, name)).toBeNull();
    },
  );

  test("a ref the remote does not list, such as an abbreviated commit, is null", () => {
    const { url, first } = makeRepo();

    expect(remoteCommitOf(url, first.slice(0, 12))).toBeNull();
    expect(remoteCommitOf(url, "no-such-branch")).toBeNull();
  });

  test("an unreachable remote is source_unreachable, naming the URL", () => {
    const url = `file://${join(makeTempDir("crew-remote-"), "missing")}`;
    let thrown: unknown;
    try {
      remoteCommitOf(url, null);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(CrewError);
    expect((thrown as CrewError).code).toBe("source_unreachable");
    expect((thrown as CrewError).details).toEqual({ url });
    expect((thrown as CrewError).message).toContain(`couldn't reach \`${displayUrl(url)}\``);
  });
});
