/**
 * What `crew install` reports when staging can't finish (§9 steps 6, 8;
 * C-SPEC-16): crew's own store failing is one error naming the store; an agent folder crew can't write is a per-agent
 * `source_unreachable`. A dependency beside its parent that can't be read
 * fails the install with its own reason, never taken from another tap.
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { paths } from "../../../src/core/paths.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

function install(home: string, args: string[]): { code: number; json: any } {
  const cap = captureStreams();
  const code = runCli(["install", ...args, "--json"], { home, streams: cap.streams });
  return { code, json: JSON.parse(cap.stdout()) };
}

/** Run `fn` with `path` at `mode`, restoring it after. */
function withMode(path: string, mode: number, fn: () => void): void {
  chmodSync(path, mode);
  try {
    fn();
  } finally {
    chmodSync(path, 0o755);
  }
}

test("crew's own store failing is one error naming the store, not the source", () => {
  const src = makeTempDir();
  makeSkill(src, "a", skillFrontmatter({ name: "a" }));
  makeSkill(src, "b", skillFrontmatter({ name: "b" }));
  const home = makeCrewHome();
  mkdirSync(paths(home).storeDir, { recursive: true });
  withMode(paths(home).storeDir, 0o555, () => {
    const r = install(home, [src]);
    expect(r.json.error.name).toBe("source_unreachable");
    expect(r.json.error.details).toEqual({ store: paths(home).storeDir });
    expect(r.json.error.message).toContain("couldn't use crew's store");
  });
  expect(readdirSync(claude.userRoot)).toEqual([]);
});

test("an agent folder crew can't write is a per-agent source_unreachable", () => {
  const src = makeTempDir();
  makeSkill(src, "a", skillFrontmatter({ name: "a" }));
  withMode(claude.userRoot, 0o555, () => {
    const r = install(makeCrewHome(), [src]);
    expect(r.code).not.toBe(0);
    const [agent] = r.json.records[0].agents;
    expect([agent.kind, agent.error.code]).toEqual(["failed", "source_unreachable"]);
  });
});

/** `src/a` depends on its sibling `b`; `breakB` makes `b` unreadable somehow. */
function parentWithSibling(breakB: (b: string) => string): { src: string; restore: string } {
  const src = makeTempDir();
  makeSkill(src, "a", skillFrontmatter({ name: "a", dependencies: ["b"] }));
  makeSkill(src, "b", skillFrontmatter({ name: "b" }));
  return { src, restore: breakB(join(src, "b")) };
}

test("C-SPEC-16 a dependency beside its parent that crew can't copy fails, naming the file", () => {
  const { src, restore } = parentWithSibling((b) => {
    writeFileSync(join(b, "notes.txt"), "private");
    return join(b, "notes.txt");
  });
  withMode(restore, 0o000, () => {
    const r = install(makeCrewHome(), [join(src, "a")]);
    expect(r.json.error.name).toBe("source_unreachable");
    expect(r.json.error.message).toMatch(/couldn't read `\S+\/b\/notes\.txt` — EACCES/);
  });
  expect(readdirSync(claude.userRoot)).toEqual([]);
});

test("a dependency beside its parent that crew can't read is never taken from another tap", () => {
  const other = makeTempDir();
  makeSkill(join(other, "skills"), "b", skillFrontmatter({ name: "b" }));
  const home = makeCrewHome();
  expect(runCli(["tap", "add", other, "other"], { home, streams: captureStreams().streams })).toBe(
    0,
  );
  const { src, restore } = parentWithSibling((b) => join(b, "SKILL.md"));
  withMode(restore, 0o000, () => {
    const r = install(home, [join(src, "a")]);
    expect(r.json.error.name).toBe("source_unreachable");
    expect(r.json.error.message).toMatch(/couldn't read `\S+\/b\/SKILL\.md`/);
  });
  expect(readdirSync(claude.userRoot)).toEqual([]);
});
