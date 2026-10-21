/** Recorded source locations retain literal names and reject invalid relative paths (§7.5, §9). */
import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDoctorMarker } from "../../src/commands/doctor/markers/validate.ts";
import type { Marker, TapConfig } from "../../src/core/types.ts";
import { withAcquiredSkillPath } from "../../src/sources/acquire/index.ts";
import { assertNoSymlinkEscape } from "../../src/util/symlink-containment.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

const marker: Marker = {
  schema_version: 1,
  name: "demo",
  agents: ["claude-code"],
  scope: "user",
  tap_name: "fixture",
  tap_kind: "path",
  tap_url: "",
  tap_subpath: "",
  tap_path: "/tmp/crew-recorded-source",
  path: "",
  ref: null,
  resolved_sha: null,
  content_hash: `sha256:${"a".repeat(64)}`,
  installed_at: "2026-10-21T00:00:00.000Z",
  installed_by: "crew",
};
for (const path of ["/absolute", "../other", "nested/../other", "nul\0name"]) {
  test(`C-STATE-14 invalid recorded path ${JSON.stringify(path)} is not a valid marker`, () => {
    expect(isDoctorMarker({ ...marker, path })).toBe(false);
  });
  for (const kind of ["path", "git"] as const) {
    test(`C-STATE-15 ${kind} rejects ${JSON.stringify(path)} before acquisition callback`, () => {
      const root = makeTempDir();
      const tap: TapConfig = {
        name: "fixture",
        kind,
        path: root,
        url: `file://${root}`,
        subpath: "",
        registered: true,
      };
      let called = false;
      expect(() =>
        withAcquiredSkillPath(tap, null, path, makeCrewHome(), () => {
          called = true;
        }),
      ).toThrow(/source-relative/);
      expect(called).toBe(false);
    });
  }
}
for (const path of ["", ".", "a//b", "..notes", "literal\\name", "a:b [glob]", ".crew.json"]) {
  test(`C-STATE-15 valid recorded spelling ${JSON.stringify(path)} is retained`, () => {
    expect(isDoctorMarker({ ...marker, path })).toBe(true);
    const root = makeTempDir();
    const tap: TapConfig = {
      name: "fixture",
      kind: "path",
      path: root,
      url: "",
      subpath: "",
      registered: true,
    };
    expect(
      withAcquiredSkillPath(tap, null, path, makeCrewHome(), (_acquired, selected) => selected),
    ).toBe(join(root, path));
  });
}
test("C-STATE-15 git no-ref acquisition rejects descendant links while local links remain trusted", () => {
  const root = makeTempDir();
  const outside = makeSkill(makeTempDir(), "demo", skillFrontmatter({ name: "demo" }));
  mkdirSync(join(root, "nested"));
  symlinkSync(outside, join(root, "linked"));
  symlinkSync(outside, join(root, "nested", "linked"));
  makeGitRepo(root);
  const home = makeCrewHome();
  const tap: TapConfig = {
    name: "fixture",
    kind: "git",
    path: "",
    url: `file://${root}`,
    subpath: "",
    registered: true,
  };
  for (const path of ["linked", "nested/linked", "linked/child"]) {
    let called = false;
    expect(() =>
      withAcquiredSkillPath(tap, null, path, home, () => {
        called = true;
      }),
    ).toThrow(/symlink/);
    expect(called).toBe(false);
  }
  const alias = join(makeTempDir(), "alias");
  symlinkSync(root, alias);
  expect(
    withAcquiredSkillPath(
      { ...tap, kind: "path", path: alias, url: "" },
      null,
      "linked",
      home,
      (_a, selected) => selected,
    ),
  ).toBe(join(alias, "linked"));
});
test("C-STATE-15 parent-prefixed literal names remain contained", () => {
  const root = makeTempDir();
  mkdirSync(join(root, "..notes"));
  expect(() => assertNoSymlinkEscape(root, join(root, "..notes"), "recorded source")).not.toThrow();
});

test("C-STATE-15 uninspectable git descendants remain operational source failures", () => {
  const root = makeTempDir();
  writeFileSync(join(root, "plain"), "ordinary file");
  makeGitRepo(root);
  const tap: TapConfig = {
    name: "fixture",
    kind: "git",
    path: "",
    url: `file://${root}`,
    subpath: "",
    registered: true,
  };
  let called = false;
  expect(() =>
    withAcquiredSkillPath(tap, null, "plain/child", makeCrewHome(), () => {
      called = true;
    }),
  ).toThrow(expect.objectContaining({ code: "source_unreachable" }));
  expect(called).toBe(false);
});
