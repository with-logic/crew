/**
 * C-LIST-09: every clone-URL spelling crew can record must produce a label
 * that parses back to the SAME remote.
 *
 * The label is advertised as paste-able, so "it parses" is not enough — a
 * shorthand that resolved to a different host or protocol would silently
 * send the user somewhere else. An SSH remote in particular is not
 * interchangeable with its HTTPS spelling: different transport, different
 * credentials.
 *
 * The guarantee covers URLs with no credentials to remove. Where C-LIST-09
 * and C-LIST-10 meet — a scheme URL carrying userinfo — masking wins and
 * the label stops being paste-able, which is the point: publishing a
 * working URL would mean publishing the secret in it. The `ssh://git@…`
 * case below pins that precedence.
 */

import { describe, expect, test } from "bun:test";
import { repoLabel } from "../../src/commands/source-label/index.ts";
import { parseRef } from "../../src/refs/parse.ts";

const ROUND_TRIP: readonly (readonly [string, string])[] = [
  ["https://github.com/acme/skills.git", "@acme/skills"],
  ["https://gitlab.com/acme/skills.git", "gl:acme/skills"],
  ["https://bitbucket.org/acme/skills.git", "bb:acme/skills"],
  ["https://git.example.com/acme/skills.git", "https://git.example.com/acme/skills.git"],
  ["https://git.example.com:8443/acme/skills.git", "https://git.example.com:8443/acme/skills.git"],
  ["git@github.com:acme/skills.git", "git@github.com:acme/skills.git"],
  ["git@git.example.com:acme/skills.git", "git@git.example.com:acme/skills.git"],
  ["ssh://git.example.com/acme/skills.git", "ssh://git.example.com/acme/skills.git"],
  ["file:///tmp/repo", "file:///tmp/repo"],
];

describe("source label round-trip", () => {
  for (const [url, expected] of ROUND_TRIP) {
    test(`C-LIST-09 ${url} round-trips to the same remote`, () => {
      const label = repoLabel(url);
      expect(label).toBe(expected);
      const parsed = parseRef(label);
      expect(parsed.type).toBe("git");
      if (parsed.type !== "git") throw new Error("expected a git source");
      expect(parsed.url).toBe(url);
    });
  }

  test("C-LIST-10 beats C-LIST-09 when a scheme url carries userinfo", () => {
    // `ssh://git@host/…` is the one shape where both criteria apply. The
    // label names the right remote but no longer clones, because the
    // userinfo is masked — an `ssh://` user can be a token just as an
    // `https://` one can, and only the SCP form is a fixed account.
    const url = "ssh://git@git.example.com/acme/skills.git";
    expect(repoLabel(url)).toBe("ssh://***@git.example.com/acme/skills.git");
  });

  test("C-LIST-09 a nested GitLab group keeps an explicit url", () => {
    // `gl:` expands to exactly two segments, so a nested group cannot use
    // the shorthand without naming a different repository.
    const url = "https://gitlab.com/acme/team/skills.git";
    expect(repoLabel(url)).toBe(url);
    const parsed = parseRef(repoLabel(url));
    if (parsed.type !== "git") throw new Error("expected a git source");
    expect(parsed.url).toBe(url);
  });
});
