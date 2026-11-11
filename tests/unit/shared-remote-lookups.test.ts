/**
 * `sharingRemoteLookups` (§9.3): within one command, `--latest` asks a
 * remote about a repository and ref once, however many manifests name it.
 * Real local repositories; `git ls-remote` calls are counted, not replaced.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { latestLock, sharingRemoteLookups } from "../../src/commands/install/manifest/latest.ts";
import { setGitRunner } from "../../src/git/exec.ts";
import { loadManifestFor, type Manifest } from "../../src/manifest/index.ts";
import { makeProject, makeSkillRepo } from "../e2e/manifest/helpers.ts";
import { commitAll, tagRepo } from "../helpers/fixtures.ts";

let lookups = 0;
let restore: () => void;
beforeEach(() => {
  lookups = 0;
  const real = setGitRunner((args, options) => {
    if (args[0] === "ls-remote") lookups += 1;
    return real(args, options);
  });
  restore = () => setGitRunner(real);
});
afterEach(() => {
  restore();
});

/** The manifest of a new project whose `.crewrc` holds `lines`. */
function manifestOf(lines: readonly string[]): Manifest {
  return loadManifestFor(makeProject(lines)) as Manifest;
}

/** A repository and the directory it lives in. */
function makeRepo(): { repo: string; dir: string } {
  const repo = makeSkillRepo(["alpha"]);
  return { repo, dir: repo.slice("file://".length) };
}

describe("sharingRemoteLookups", () => {
  test("two manifests naming one source and ref cost one lookup, and get the same commit", () => {
    const { repo } = makeRepo();
    const [first, second] = [manifestOf([repo]), manifestOf([repo])];

    const [a, b] = sharingRemoteLookups(() => [
      latestLock(first, new Map()),
      latestLock(second, new Map()),
    ]);

    expect(lookups).toBe(1);
    expect(a.get(repo)).toMatch(/^[0-9a-f]{40}$/);
    expect(b.get(repo)).toBe(a.get(repo) as string);
  });

  test("two spellings of one repository are one source", () => {
    const { repo } = makeRepo();
    const [first, second] = [manifestOf([`${repo}@main`]), manifestOf([`${repo}/@main`])];

    sharingRemoteLookups(() => [latestLock(first, new Map()), latestLock(second, new Map())]);

    expect(lookups).toBe(1);
  });

  test("different refs of one repository are looked up separately, and keep their own commits", () => {
    const { repo, dir } = makeRepo();
    tagRepo(dir, "v1");
    const second = commitAll(dir, "second");
    const [onMain, onTag] = [manifestOf([`${repo}@main`]), manifestOf([`${repo}@v1`])];

    const [a, b] = sharingRemoteLookups(() => [
      latestLock(onMain, new Map()),
      latestLock(onTag, new Map()),
    ]);

    expect(lookups).toBe(2);
    expect(a.get(`${repo}@main`)).toBe(second);
    expect(b.get(`${repo}@v1`)).not.toBe(second);
  });

  test("a ref the remote does not list is also asked about once", () => {
    const { repo, dir } = makeRepo();
    const line = `${repo}@${commitAll(dir, "second").slice(0, 12)}`;
    const [first, second] = [manifestOf([line]), manifestOf([line])];

    const [a] = sharingRemoteLookups(() => [
      latestLock(first, new Map()),
      latestLock(second, new Map()),
    ]);

    expect(lookups).toBe(1);
    expect(a.has(line)).toBe(false);
  });

  test("nothing is remembered once the command is over, or outside one", () => {
    const { repo, dir } = makeRepo();
    const manifest = manifestOf([repo]);
    sharingRemoteLookups(() => latestLock(manifest, new Map()));
    const moved = commitAll(dir, "second");

    expect(latestLock(manifest, new Map()).get(repo)).toBe(moved);
    expect(latestLock(manifest, new Map()).get(repo)).toBe(moved);
    expect(lookups).toBe(3);
  });

  test("the sharing ends even when the work raises", () => {
    const { repo } = makeRepo();
    const manifest = manifestOf([repo]);

    expect(() =>
      sharingRemoteLookups(() => {
        latestLock(manifest, new Map());
        throw new Error("stop");
      }),
    ).toThrow("stop");
    latestLock(manifest, new Map());

    expect(lookups).toBe(2);
  });
});
