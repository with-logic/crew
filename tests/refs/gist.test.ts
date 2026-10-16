/**
 * Gist references (§8.2 "Gists"; C-REF-37..39, C-TAP-26, C-LIST-09).
 *
 * Everything here is decided by the parser before any clone, so nothing
 * touches the network.
 */

import { describe, expect, test } from "bun:test";
import { repoLabel } from "../../src/commands/source-label/index.ts";
import type { CrewError } from "../../src/core/errors.ts";
import type { GitSource, PathSource } from "../../src/core/types.ts";
import { deriveAutoTapName } from "../../src/install/tap-naming.ts";
import { isGistUrl } from "../../src/refs/gist.ts";
import { parseRef } from "../../src/refs/parse.ts";
import { splitGistFile } from "../../src/sources/gist.ts";

const ID = "7489027d2d93c185f48a628547c043d8";
const CLONE = `https://gist.github.com/${ID}.git`;
const REVISION = "95ab45a8c0ffee00000000000000000000000001";

function parseError(raw: string): CrewError {
  try {
    parseRef(raw);
  } catch (err) {
    return err as CrewError;
  }
  throw new Error(`expected \`${raw}\` to be rejected`);
}

describe("gist URLs", () => {
  for (const raw of [
    `https://gist.github.com/${ID}`,
    `https://gist.github.com/${ID}.git`,
    `https://gist.github.com/acme/${ID}`,
    `https://gist.github.com/acme/${ID}.git/`,
    `https://www.gist.github.com/acme/${ID}?tab=1#file-prd-md`,
    `gist.github.com/acme/${ID}`,
  ]) {
    test(`C-REF-37 ${raw} records the gist's clone URL`, () => {
      expect(parseRef(raw)).toEqual({ type: "git", url: CLONE, ref: null, subpath: "" });
    });
  }

  test("C-REF-37 an SSH gist remote is kept as typed", () => {
    const ssh = `git@gist.github.com:${ID}.git`;
    expect(parseRef(ssh)).toEqual({ type: "git", url: ssh, ref: null, subpath: "" });
  });

  test("C-REF-38 a revision page pins that revision", () => {
    const parsed = parseRef(`https://gist.github.com/acme/${ID}/${REVISION}`);
    expect(parsed).toEqual({ type: "git", url: CLONE, ref: REVISION, subpath: "" });
  });

  test("C-REF-38 an explicit @ref wins over the revision page", () => {
    const parsed = parseRef(`https://gist.github.com/acme/${ID}/${REVISION}@main`);
    expect(parsed).toMatchObject({ url: CLONE, ref: "main" });
  });

  test("a //<file> tail and an @ref both survive", () => {
    const parsed = parseRef(`https://gist.github.com/acme/${ID}@v1//prd.md`);
    expect(parsed).toEqual({ type: "git", url: CLONE, ref: "v1", subpath: "prd.md" });
  });

  for (const raw of [
    "https://gist.github.com/acme",
    "https://gist.github.com/",
    `https://gist.github.com/acme/${ID}/raw/${REVISION}/prd.md`,
    `https://gist.github.com/acme/${ID}/revisions`,
    `https://gist.github.com/acme/${ID}/not-a-revision`,
  ]) {
    test(`C-REF-39 ${raw} is invalid_ref`, () => {
      const err = parseError(raw);
      expect(err.code).toBe("invalid_ref");
      expect(err.message).toContain("isn't a gist");
    });
  }

  test("C-REF-39 a rejected gist URL never prints its credentials", () => {
    const err = parseError("https://oauth2:ghp_secretvalue@gist.github.com/acme");
    expect(err.message).not.toContain("ghp_secretvalue");
    expect(JSON.stringify(err.details)).not.toContain("ghp_secretvalue");
  });
});

describe("isGistUrl", () => {
  for (const url of [
    CLONE,
    `HTTPS://Gist.GitHub.com/${ID}.git`,
    `https://user:token@gist.github.com/${ID}.git`,
    `https://gist.github.com:443/${ID}.git`,
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
    `file:///tmp/gist.github.com/${ID}`,
    "",
  ]) {
    test(`does not recognise ${JSON.stringify(url)}`, () => expect(isGistUrl(url)).toBe(false));
  }
});

describe("gist tap names and labels", () => {
  test("C-TAP-26 a gist tap is named gist-<first 8 of the ID>", () => {
    expect(deriveAutoTapName(CLONE, "")).toBe("gist-7489027d");
    expect(deriveAutoTapName(`git@gist.github.com:${ID}.git`, "")).toBe("gist-7489027d");
    expect(deriveAutoTapName("https://gist.github.com/1234.git", "")).toBe("gist-1234");
  });

  test("C-LIST-09 a gist skill's label parses back to the gist and its file", () => {
    const label = `${repoLabel(CLONE)}//prd.md`;
    const parsed = parseRef(label);
    expect(parsed).toEqual({ type: "git", url: CLONE, ref: null, subpath: "prd.md" });
    if (parsed.type !== "git") throw new Error("unreachable");
    expect(splitGistFile(parsed)).toEqual({
      source: { type: "git", url: CLONE, ref: null, subpath: "" },
      file: "prd.md",
    });
  });

  test("splitGistFile leaves every other source's subpath on the tap", () => {
    const repo: GitSource = {
      type: "git",
      url: "https://github.com/a/b.git",
      ref: null,
      subpath: "x",
    };
    expect(splitGistFile(repo)).toEqual({ source: repo, file: "" });
    const path: PathSource = { type: "path", path: "/tmp/skills" };
    expect(splitGistFile(path)).toEqual({ source: path, file: "" });
  });
});
