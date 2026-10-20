/**
 * What `crew install` reports for local faults (§9 steps 6, 8, 9;
 * C-SPEC-16): crew's own store failing is one error naming the store; an
 * agent folder crew can't write fails that agent with its own error. A
 * dependency beside its parent that crew can't load — a folder it can't
 * look into, an unreadable SKILL.md — fails the install with that
 * reason, naming the dependency, and is never taken from another tap
 * (an invalid one: `sibling-dependency.test.ts`). A skipped skill's next step
 * is shown, but kept out of `--json`. A folder crew can't look into
 * isn't taken for a skill at all.
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

/** The parts of `crew install --json` these tests read. */
interface InstallJson {
  readonly error: {
    readonly name: string;
    readonly message: string;
    readonly details: {
      readonly path?: string;
      readonly dependency?: string;
      readonly store?: string;
    };
  };
  readonly records: readonly {
    readonly agents: readonly {
      readonly kind: string;
      readonly error: { readonly code: string; readonly message: string };
    }[];
  }[];
  readonly skipped: readonly { readonly path: string; readonly code: string }[];
}

function install(home: string, args: string[]): { code: number; json: InstallJson } {
  const cap = captureStreams();
  const code = runCli(["install", ...args, "--json"], { home, streams: cap.streams });
  return { code, json: JSON.parse(cap.stdout()) as InstallJson };
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

test("C-SPEC-16 crew's own store failing is one error naming the store, not the source", () => {
  const src = makeTempDir();
  makeSkill(src, "a", skillFrontmatter({ name: "a" }));
  makeSkill(src, "b", skillFrontmatter({ name: "b" }));
  const home = makeCrewHome();
  mkdirSync(paths(home).storeDir, { recursive: true });
  withMode(paths(home).storeDir, 0o555, () => {
    const r = install(home, [src]);
    expect([r.code, r.json.error.name]).toEqual([5, "source_unreachable"]);
    expect(r.json.error.details).toEqual({ store: paths(home).storeDir });
    expect(r.json.error.message).toContain("couldn't use crew's store");
  });
  expect(readdirSync(claude.userRoot)).toEqual([]);
});

test("an agent folder crew can't write fails that agent, naming the folder", () => {
  const src = makeTempDir();
  makeSkill(src, "a", skillFrontmatter({ name: "a" }));
  withMode(claude.userRoot, 0o555, () => {
    const r = install(makeCrewHome(), [src]);
    expect(r.code).toBe(1);
    const agent = r.json.records[0]!.agents[0]!;
    // Not the source's fault: reported by the agent folder's own error.
    expect([agent.kind, agent.error.code]).toEqual(["failed", "EACCES"]);
    expect(agent.error.message).toContain(claude.userRoot);
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
    expect([r.code, r.json.error.name]).toEqual([5, "source_unreachable"]);
    expect(r.json.error.message).toMatch(/couldn't read `\S+\/b\/notes\.txt` — EACCES/);
  });
  expect(readdirSync(claude.userRoot)).toEqual([]);
});

test("C-SPEC-16 a dependency beside its parent that crew can't read is never taken from another tap", () => {
  const other = makeTempDir();
  makeSkill(join(other, "skills"), "b", skillFrontmatter({ name: "b" }));
  const home = makeCrewHome();
  expect(runCli(["tap", "add", other, "other"], { home, streams: captureStreams().streams })).toBe(
    0,
  );
  const { src, restore } = parentWithSibling((b) => join(b, "SKILL.md"));
  withMode(restore, 0o000, () => {
    const r = install(home, [join(src, "a")]);
    expect([r.code, r.json.error.name]).toEqual([5, "source_unreachable"]);
    expect(r.json.error.message).toMatch(/couldn't read `\S+\/b\/SKILL\.md`/);
    expect(r.json.error.details.path).toBe(join(src, "b", "SKILL.md"));
    const human = captureStreams();
    runCli(["install", join(src, "a")], { home, streams: human.streams });
    expect(human.stderr() + human.stdout()).toContain("Check that it is readable by you");
  });
  expect(readdirSync(claude.userRoot)).toEqual([]);
});

/** A home with tap `other` holding a valid `b`, the name `a`'s dependency asks for. */
function homeWithOtherB(): string {
  const other = makeTempDir();
  makeSkill(join(other, "skills"), "b", skillFrontmatter({ name: "b" }));
  const home = makeCrewHome();
  runCli(["tap", "add", other, "other"], { home, streams: captureStreams().streams });
  return home;
}

test("C-SPEC-16 a dependency folder crew can't look into fails the install, not another tap's", () => {
  const home = homeWithOtherB();
  const { src, restore } = parentWithSibling((b) => b);
  withMode(restore, 0o000, () => {
    const r = install(home, [join(src, "a")]);
    expect([r.code, r.json.error.name]).toEqual([5, "source_unreachable"]);
    expect(r.json.error.message).toMatch(/^dependency `b`: couldn't look at `\S+\/b\/SKILL\.md`/);
    expect(r.json.error.details.dependency).toBe("b");
    expect(r.json.error.details.path).toBe(join(src, "b", "SKILL.md"));
  });
  expect(readdirSync(claude.userRoot)).toEqual([]);
});

test("a skipped skill's next step is shown, and kept out of --json", () => {
  const src = makeTempDir();
  makeSkill(src, "good", skillFrontmatter({ name: "good" }));
  makeSkill(src, "locked", skillFrontmatter({ name: "locked" }));
  withMode(join(src, "locked", "SKILL.md"), 0o000, () => {
    const cap = captureStreams();
    runCli(["install", src], { home: makeCrewHome(), streams: cap.streams });
    expect(cap.stdout().replace(/\s+/g, " ")).toContain("Check that it is readable by you");
    const json = install(makeCrewHome(), [src]).json;
    expect(json.skipped.map((skip: object) => Object.keys(skip).sort())).toEqual([
      ["code", "message", "path"],
    ]);
  });
});

test("C-SPEC-16 a dependency from a tap that crew can't copy is skipped; its dependent installs", () => {
  const other = makeTempDir();
  const b = makeSkill(join(other, "skills"), "b", skillFrontmatter({ name: "b" }));
  writeFileSync(join(b, "notes.txt"), "private");
  const home = makeCrewHome();
  runCli(["tap", "add", other, "other"], { home, streams: captureStreams().streams });
  const src = makeTempDir();
  makeSkill(src, "a", skillFrontmatter({ name: "a", dependencies: ["b"] }));
  withMode(join(b, "notes.txt"), 0o000, () => {
    const r = install(home, [join(src, "a")]);
    expect(r.code).toBe(1);
    expect(r.json.skipped.map((s) => [s.path, s.code])).toEqual([[b, "source_unreachable"]]);
  });
  expect(readdirSync(claude.userRoot)).toEqual(["a"]);
});

test("a folder crew can't look into isn't taken for a skill", () => {
  const src = makeTempDir();
  makeSkill(src, "good", skillFrontmatter({ name: "good" }));
  mkdirSync(join(src, "sealed"));
  chmodSync(join(src, "sealed"), 0o666);
  try {
    expect(install(makeCrewHome(), [src]).code).toBe(0);
    expect(readdirSync(claude.userRoot)).toEqual(["good"]);
  } finally {
    chmodSync(join(src, "sealed"), 0o755);
  }
});
