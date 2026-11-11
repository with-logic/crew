/**
 * `remoteCommitOf` (§9.3): what a branch, a tag, or the default branch of
 * a remote names right now. Real local repositories over `file://`.
 */

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { runGit } from "../../src/git/exec.ts";
import { remoteCommitOf } from "../../src/git/repo/remote.ts";
import { commitAll, makeGitRepo, makeTempDir, tagRepo } from "../helpers/fixtures.ts";

/** A repository with one commit; returns its directory, `file://` URL, and that commit. */
function makeRepo(): { dir: string; url: string; first: string } {
  const dir = makeTempDir("crew-remote-");
  writeFileSync(join(dir, "a.txt"), "one\n");
  const { sha } = makeGitRepo(dir);
  return { dir, url: `file://${dir}`, first: sha };
}

/** Add a commit to `dir` and return it. */
function commitMore(dir: string): string {
  writeFileSync(join(dir, "a.txt"), `${Math.random()}\n`);
  return commitAll(dir, "more");
}

function git(dir: string, ...args: string[]): string {
  return runGit(args, { cwd: dir }).stdout.trim();
}

describe("remoteCommitOf", () => {
  test("no ref is the default branch's current commit", () => {
    const { dir, url, first } = makeRepo();
    expect(remoteCommitOf(url, null)).toBe(first);

    const second = commitMore(dir);
    expect(remoteCommitOf(url, null)).toBe(second);
  });

  test("a branch is that branch's current commit, not the default branch's", () => {
    const { dir, url, first } = makeRepo();
    const main = git(dir, "branch", "--show-current");
    git(dir, "checkout", "-q", "-b", "next");
    const onNext = commitMore(dir);
    git(dir, "checkout", "-q", main);

    expect(remoteCommitOf(url, "next")).toBe(onNext);
    expect(remoteCommitOf(url, main)).toBe(first);
  });

  test("a lightweight tag is the commit it names", () => {
    const { dir, url, first } = makeRepo();
    tagRepo(dir, "v1.0.0");
    commitMore(dir);

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
    commitMore(dir);
    git(dir, "checkout", "-q", main);

    expect(remoteCommitOf(url, "stable")).toBe(first);
  });

  test("a name that is only a prefix or suffix of a real ref is not found", () => {
    const { dir, url } = makeRepo();
    git(dir, "branch", "release/next");

    expect(remoteCommitOf(url, "next")).toBeNull();
    expect(remoteCommitOf(url, "release")).toBeNull();
    expect(remoteCommitOf(url, "rel*")).toBeNull();
  });

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
  });
});
