/**
 * Folders discovery can't list (§9 step 5; C-SPEC-18): below `skills/`,
 * the source's index, one might hold a skill, so it is reported as
 * `source_unreachable` while the source's other skills install — at
 * install and on update's re-expansion. A `skills/` folder or a source
 * crew can't list is `source_unreachable` for the whole source, never an
 * unexpected error. At the root, and in recursive discovery, such a
 * folder is passed over. (On update, a tap whose `skills/` crew can't
 * list: `../update-skill-path/unlistable-tap.test.ts`.)
 */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../helpers/scoped-install.ts";

let claude: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  claude = redirectClaudeCode();
});
afterEach(() => restoreClaudeCode(claude.originals));

interface Run {
  readonly code: number;
  readonly json: {
    readonly error?: { readonly name: string; readonly message: string };
    readonly skipped?: readonly { readonly path: string; readonly code: string }[];
    readonly tap_reexpand_rows?: readonly {
      readonly name: string;
      readonly kind: string;
      readonly error?: { readonly code: string };
    }[];
  };
}

function crew(home: string, args: string[]): Run {
  const cap = captureStreams();
  const code = runCli([...args, "--json"], { home, streams: cap.streams });
  return { code, json: JSON.parse(cap.stdout()) as Run["json"] };
}

/** Run `fn` with `dir` unlistable, restoring it after. */
function sealed<T>(dir: string, fn: () => T): T {
  chmodSync(dir, 0o000);
  try {
    return fn();
  } finally {
    chmodSync(dir, 0o755);
  }
}

/** A source with `skills/good`, and an empty folder at `skills/<at>`. */
function sourceWith(at: string): { src: string; folder: string } {
  const src = makeTempDir();
  makeSkill(join(src, "skills"), "good", skillFrontmatter({ name: "good" }));
  const folder = join(src, "skills", at);
  mkdirSync(folder, { recursive: true });
  return { src, folder };
}

for (const [where, at] of [
  ["under skills/", "locked"],
  ["under a namespace", join("team", "locked")],
] as const) {
  test(`C-SPEC-18 a folder ${where} crew can't list is reported; the others install`, () => {
    const { src, folder } = sourceWith(at);
    const r = sealed(folder, () => crew(makeCrewHome(), ["install", src]));
    expect(r.code).toBe(1);
    expect(r.json.skipped?.map((s) => [s.path, s.code])).toEqual([[folder, "source_unreachable"]]);
    expect(readdirSync(claude.userRoot)).toEqual(["good"]);
  });
}

test("C-SPEC-18 a skills/ folder crew can't list is source_unreachable for the source", () => {
  const { src } = sourceWith("other");
  const skills = join(src, "skills");
  const r = sealed(skills, () => crew(makeCrewHome(), ["install", src]));
  expect([r.code, r.json.error?.name]).toEqual([5, "source_unreachable"]);
  expect(r.json.error?.message).toContain(`couldn't read \`${skills}\``);
});

test("C-SPEC-18 a source crew can't list is source_unreachable", () => {
  const parent = makeTempDir();
  const src = join(parent, "src");
  makeSkill(src, "good", skillFrontmatter({ name: "good" }));
  chmodSync(src, 0o300);
  try {
    const r = crew(makeCrewHome(), ["install", src]);
    expect([r.code, r.json.error?.name]).toEqual([5, "source_unreachable"]);
  } finally {
    chmodSync(src, 0o755);
  }
});

test("C-SPEC-18 a folder at the root crew can't list is passed over", () => {
  const src = makeTempDir();
  makeSkill(src, "good", skillFrontmatter({ name: "good" }));
  const locked = join(src, "locked");
  mkdirSync(locked);
  const r = sealed(locked, () => crew(makeCrewHome(), ["install", src]));
  expect(r.code).toBe(0);
  expect(r.json.skipped).toEqual([]);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
});

test("C-SPEC-18 a source recursive discovery can list but not look into is source_unreachable", () => {
  const parent = makeTempDir();
  const src = join(parent, "src");
  makeSkill(join(src, "deep"), "good", skillFrontmatter({ name: "good" }));
  chmodSync(src, 0o444);
  try {
    const r = crew(makeCrewHome(), ["install", "--recursive", src]);
    expect([r.code, r.json.error?.name]).toEqual([5, "source_unreachable"]);
  } finally {
    chmodSync(src, 0o755);
  }
});

test("C-SPEC-18 recursive discovery passes over a folder crew can't list", () => {
  const src = makeTempDir();
  makeSkill(join(src, "deep", "nested"), "good", skillFrontmatter({ name: "good" }));
  const locked = join(src, "deep", "locked");
  mkdirSync(locked);
  const r = sealed(locked, () => crew(makeCrewHome(), ["install", "--recursive", src]));
  expect(r.code).toBe(0);
  expect(readdirSync(claude.userRoot)).toEqual(["good"]);
});

test("C-SPEC-18 a new child folder crew can't list is reported on update; the run exits 1", () => {
  const home = makeCrewHome();
  const { src } = sourceWith("other");
  expect(crew(home, ["tap", "add", src, "mine"]).code).toBe(0);
  expect(crew(home, ["install", "mine"]).code).toBe(0);
  const locked = join(src, "skills", "locked");
  mkdirSync(locked);
  const r = sealed(locked, () => crew(home, ["update"]));
  expect(r.code).toBe(1);
  const rows = r.json.tap_reexpand_rows?.map((row) => [row.name, row.kind, row.error?.code]);
  expect(rows).toEqual([["skills/locked", "tap_error", "source_unreachable"]]);
});
