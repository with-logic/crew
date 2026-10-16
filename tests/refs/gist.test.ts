/**
 * Gist references (§8.2 "Gists"; C-REF-37..39, C-TAP-30).
 *
 * Everything here is decided by the parser before any clone, so nothing
 * touches the network.
 */

import { describe, expect, test } from "bun:test";
import type { CrewError } from "../../src/core/errors.ts";
import { gistIdentityPath, isGistUrl } from "../../src/core/gist-url.ts";
import { canonicalRepoUrl } from "../../src/core/repo-url.ts";
import type { GitSource, PathSource } from "../../src/core/types.ts";
import { deriveAutoTapName } from "../../src/install/tap-naming.ts";
import { splitGistFile } from "../../src/refs/gist.ts";
import { parseRef } from "../../src/refs/parse.ts";

const ID = "7489027d2d93c185f48a628547c043d8";
const CLONE = `https://gist.github.com/${ID}.git`;
const REVISION = "95ab45a8c0ffee00000000000000000000000001";

function rejection(fn: () => unknown): CrewError {
  try {
    fn();
  } catch (err) {
    return err as CrewError;
  }
  throw new Error("expected a rejection");
}

function gistSource(subpath: string): GitSource {
  return { type: "git", url: CLONE, ref: null, subpath };
}

describe("gist URLs", () => {
  for (const raw of [
    `https://gist.github.com/${ID}`,
    `https://gist.github.com/${ID}.git`,
    `https://gist.github.com/acme/${ID}`,
    `https://gist.github.com/acme/${ID}.git/`,
    `https://gist.github.com/acme/${ID.toUpperCase()}`,
    `https://www.gist.github.com/acme/${ID}?tab=1#comments`,
    `gist.github.com/acme/${ID}`,
  ]) {
    test(`C-REF-37 ${raw} records the gist's clone URL`, () => {
      expect(parseRef(raw)).toEqual(gistSource(""));
    });
  }

  test("C-REF-37 an SSH gist remote is kept as typed", () => {
    const ssh = `git@gist.github.com:${ID}.git`;
    expect(parseRef(ssh)).toEqual({ type: "git", url: ssh, ref: null, subpath: "" });
  });

  test("C-REF-38 a revision page pins that revision, with or without the owner", () => {
    const pinned = { ...gistSource(""), ref: REVISION };
    expect(parseRef(`https://gist.github.com/acme/${ID}/${REVISION}`)).toEqual(pinned);
    expect(parseRef(`https://gist.github.com/${ID}/${REVISION.toUpperCase()}`)).toEqual(pinned);
  });

  test("C-REF-38 an explicit @ref wins over the revision page", () => {
    const parsed = parseRef(`https://gist.github.com/acme/${ID}/${REVISION}@main`);
    expect(parsed).toMatchObject({ url: CLONE, ref: "main" });
  });

  test("a //<file> tail and an @ref both survive", () => {
    const parsed = parseRef(`https://gist.github.com/acme/${ID}@v1//prd.md`);
    expect(parsed).toEqual({ ...gistSource("prd.md"), ref: "v1" });
  });

  for (const raw of [
    "https://gist.github.com/acme",
    "https://gist.github.com/",
    `https://gist.github.com/acme/${ID}/revisions`,
    `https://gist.github.com/acme/${ID}/not-a-revision`,
    `https://gist.github.com/acme/${ID}/raw/${REVISION}/prd.md`,
  ]) {
    test(`C-REF-39 ${raw} is invalid_ref, with the gist forms as the hint`, () => {
      const err = rejection(() => parseRef(raw));
      expect(err.code).toBe("invalid_ref");
      expect(err.message).toContain("isn't a gist page crew can install from");
      expect(err.remedy).toContain("//<file>.md");
    });
  }

  test("C-REF-39 a link to one file's anchor is invalid_ref, not the whole gist", () => {
    const err = rejection(() => parseRef(`https://gist.github.com/acme/${ID}#file-prd-md`));
    expect(err.code).toBe("invalid_ref");
    expect(err.message).toContain("links to one file of a gist");
    expect(err.message).toContain("//<file>.md");
  });

  test("C-REF-39 a rejected gist URL never prints its credentials", () => {
    const err = rejection(() => parseRef("https://oauth2:ghp_secretvalue@gist.github.com/acme"));
    expect(err.message).not.toContain("ghp_secretvalue");
    expect(JSON.stringify(err.details)).not.toContain("ghp_secretvalue");
  });
});

describe("gist //<file> selections", () => {
  test("splitGistFile moves the file off the whole-gist source", () => {
    expect(splitGistFile(gistSource("prd.md"))).toEqual({ whole: gistSource(""), file: "prd.md" });
    expect(splitGistFile(gistSource("NOTES.MD")).file).toBe("NOTES.MD");
  });

  for (const file of ["sub/prd.md", "notes.txt", ".git/HEAD", "SKILL"]) {
    test(`C-REF-39 //${file} doesn't name a gist skill file`, () => {
      const err = rejection(() => splitGistFile(gistSource(file)));
      expect(err.code).toBe("invalid_ref");
      expect(err.message).toContain("doesn't name a gist file");
    });
  }

  test("splitGistFile leaves every other source's subpath on the tap", () => {
    const repo: GitSource = {
      type: "git",
      url: "https://github.com/a/b.git",
      ref: null,
      subpath: "x",
    };
    expect(splitGistFile(repo)).toEqual({ whole: repo, file: "" });
    const path: PathSource = { type: "path", path: "/tmp/skills" };
    expect(splitGistFile(path)).toEqual({ whole: path, file: "" });
    expect(splitGistFile(gistSource(""))).toEqual({ whole: gistSource(""), file: "" });
  });
});

describe("isGistUrl", () => {
  for (const url of [
    CLONE,
    `HTTPS://Gist.GitHub.com/${ID}.git`,
    `https://user:token@gist.github.com/${ID}.git`,
    `https://gist.github.com:443/${ID}.git`,
    `https://www.gist.github.com/${ID}.git`,
    `ssh://git@gist.github.com/${ID}.git`,
    `git@gist.github.com:${ID}.git`,
  ]) {
    test(`recognises ${url}`, () => expect(isGistUrl(url)).toBe(true));
  }

  for (const url of [
    "https://github.com/acme/skills.git",
    `https://gist.github.com.evil.example/${ID}.git`,
    `https://evil.example/gist.github.com/${ID}.git`,
    `https://notgist.github.com/${ID}.git`,
    `https://gist.github.com:x@evil.example/${ID}`,
    `ssh://gist.github.com:22@evil.example/${ID}.git`,
    `git@evil.example:gist.github.com/${ID}.git`,
    `file:///tmp/gist.github.com/${ID}`,
    "https://[gist.github.com",
    "",
  ]) {
    test(`does not recognise ${JSON.stringify(url)}`, () => expect(isGistUrl(url)).toBe(false));
  }
});

describe("gist repository identity", () => {
  test("a gist is one repository with or without its owner, in any case", () => {
    const canonical = `https://gist.github.com/${ID}`;
    expect(canonicalRepoUrl(CLONE)).toBe(canonical);
    expect(canonicalRepoUrl(`https://gist.github.com/acme/${ID}`)).toBe(canonical);
    expect(canonicalRepoUrl(`https://gist.github.com/Acme/${ID.toUpperCase()}.git`)).toBe(
      canonical,
    );
  });

  test("only a gist's one- and two-segment paths reduce to the ID", () => {
    expect(gistIdentityPath("")).toBe("");
    expect(gistIdentityPath("/a/b/c")).toBe("/a/b/c");
    expect(canonicalRepoUrl("https://github.com/acme/skills")).toBe(
      "https://github.com/acme/skills",
    );
  });
});

describe("gist tap names", () => {
  test("C-TAP-30 a gist tap is named gist-<first 8 of the ID>", () => {
    expect(deriveAutoTapName(CLONE, "")).toBe("gist-7489027d");
    expect(deriveAutoTapName(`git@gist.github.com:${ID}.git`, "")).toBe("gist-7489027d");
    expect(deriveAutoTapName("https://gist.github.com/1234.git", "")).toBe("gist-1234");
  });
});
