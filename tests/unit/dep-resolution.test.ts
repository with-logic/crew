/**
 * Unit tests for same-tap dependency lookup (§9 step 6).
 */

import { describe, expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import type { Config, TapConfig } from "../../src/core/types.ts";
import { findSiblingDep } from "../../src/install/dep-resolution.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function pathTap(path: string): TapConfig {
  return {
    name: "local",
    kind: "path",
    registered: true,
    url: "",
    subpath: "",
    path,
  };
}

function gitTap(): TapConfig {
  return {
    name: "remote",
    kind: "git",
    registered: true,
    url: "file:///tmp/repo",
    subpath: "",
    path: "",
  };
}

function configWith(tap: TapConfig): Config {
  return {
    taps: [tap],
    disabled_agents: [],
    forced_agents: [],
    autoupdate: { enabled: false, interval_seconds: 3600 },
  };
}

describe("findSiblingDep", () => {
  test("returns null when no sibling matches the bare name", () => {
    const root = makeTempDir("dep-resolution-");
    makeSkill(root, "parent-source", skillFrontmatter({ name: "parent" }));
    makeSkill(root, "bad-source", skillFrontmatter({ name: "Bad" }));
    makeSkill(root, "other-source", skillFrontmatter({ name: "other" }));

    const hit = findSiblingDep(
      { tap: pathTap(root), tapRelativePath: "parent-source" },
      "missing",
      "/unused",
      configWith(pathTap(root)),
    );
    expect(hit).toBeNull();
  });

  test("duplicate declared sibling names throw conflicting_dependencies", () => {
    const root = makeTempDir("dep-resolution-");
    makeSkill(root, "parent-source", skillFrontmatter({ name: "parent" }));
    makeSkill(root, "one", skillFrontmatter({ name: "dep" }));
    makeSkill(root, "two", skillFrontmatter({ name: "dep" }));

    expect(() =>
      findSiblingDep(
        { tap: pathTap(root), tapRelativePath: "parent-source" },
        "dep",
        "/unused",
        configWith(pathTap(root)),
      ),
    ).toThrow(CrewError);
  });

  test("repo-root git skill does not look outside the clone for siblings", () => {
    const hit = findSiblingDep(
      { tap: gitTap(), tapRelativePath: "" },
      "dep",
      "/unused",
      configWith(gitTap()),
    );

    expect(hit).toBeNull();
  });
});
