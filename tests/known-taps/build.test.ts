/**
 * Tests for known-tap registry build tooling (§16.2.1).
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildKnownTapRegistry } from "../../src/known-taps/build/index.ts";
import { parseKnownTapManifest } from "../../src/known-taps/build/manifest.ts";
import { assertRelativePosixPath } from "../../src/known-taps/build/paths.ts";
import type { KnownTapManifest } from "../../src/known-taps/build/types.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

describe("known tap manifest parsing", () => {
  test("parses pinned tap sources", () => {
    const manifest = parseKnownTapManifest({
      version: 1,
      taps: [
        {
          name: "alpha",
          url: "https://github.com/example/skills.git",
          subpath: "",
          description: "Alpha skills",
          trust: "curated",
          commit: "0123456789abcdef0123456789abcdef01234567",
          trackingRef: "main",
        },
      ],
    });

    expect(manifest.taps[0]?.trackingRef).toBe("main");
  });

  test("rejects malformed manifests", () => {
    expect(() => parseKnownTapManifest(null)).toThrow("manifest must be an object");
    expect(() => parseKnownTapManifest({ version: 2, taps: [] })).toThrow("version must be 1");
    expect(() => parseKnownTapManifest({ version: 1, taps: {} })).toThrow("taps must be");
    expect(() => parseKnownTapManifest({ version: 1, taps: [null] })).toThrow(
      "known tap must be an object",
    );
  });

  test("rejects duplicate tap names", () => {
    expect(() =>
      parseKnownTapManifest({ version: 1, taps: [validSource(), validSource()] }),
    ).toThrow("duplicate known tap name `alpha`");
  });

  test("rejects malformed tap fields", () => {
    const source = validSource();
    expect(() => parseKnownTapManifest({ version: 1, taps: [{ ...source, name: "Bad" }] })).toThrow(
      "must match crew's name grammar",
    );
    expect(() => parseKnownTapManifest({ version: 1, taps: [{ ...source, url: "" }] })).toThrow(
      "field `url`",
    );
    expect(() =>
      parseKnownTapManifest({ version: 1, taps: [{ ...source, description: "" }] }),
    ).toThrow("field `description`");
    expect(() =>
      parseKnownTapManifest({ version: 1, taps: [{ ...source, trust: "unknown" }] }),
    ).toThrow("field `trust`");
    expect(() =>
      parseKnownTapManifest({ version: 1, taps: [{ ...source, trust: "official" }] }),
    ).not.toThrow();
    expect(() =>
      parseKnownTapManifest({ version: 1, taps: [{ ...source, commit: "abc" }] }),
    ).toThrow("field `commit`");
    expect(() =>
      parseKnownTapManifest({ version: 1, taps: [{ ...source, subpath: null }] }),
    ).toThrow("field `subpath`");
    expect(() =>
      parseKnownTapManifest({ version: 1, taps: [{ ...source, subpath: "../skills" }] }),
    ).toThrow("invalid path");
    expect(() =>
      parseKnownTapManifest({ version: 1, taps: [{ ...source, trackingRef: "" }] }),
    ).toThrow("field `trackingRef`");
  });

  test("validates relative POSIX paths", () => {
    expect(() => assertRelativePosixPath("", "path", false)).toThrow("must not be empty");
    expect(() => assertRelativePosixPath("/abs", "path", true)).toThrow("relative POSIX");
    expect(() => assertRelativePosixPath("a\\b", "path", true)).toThrow("relative POSIX");
    expect(() => assertRelativePosixPath("a/../b", "path", true)).toThrow("invalid path");
    expect(() => assertRelativePosixPath("", "path", true)).not.toThrow();
    expect(() => assertRelativePosixPath("a/b", "path", true)).not.toThrow();
  });
});

describe("known tap registry builder", () => {
  test("indexes pinned commits into registry entries", () => {
    const root = makeTempDir("crew-known-taps-");
    const repoA = join(root, "repo-a");
    const repoB = join(root, "repo-b");
    mkdirSync(join(repoA, "catalog", "skills", "database"), { recursive: true });
    makeSkill(join(repoA, "catalog", "skills"), "beta", skillFrontmatter({ name: "beta" }));
    makeSkill(join(repoA, "catalog", "skills"), "alpha", skillFrontmatter({ name: "alpha" }));
    makeSkill(
      join(repoA, "catalog", "skills", "database"),
      "schema-review",
      skillFrontmatter({ name: "schema-review", description: "Review schema changes" }),
    );
    const pinnedA = makeGitRepo(repoA).sha;
    makeSkill(join(repoA, "catalog", "skills"), "newer", skillFrontmatter({ name: "newer" }));
    commitAll(repoA, "newer skill");
    mkdirSync(repoB, { recursive: true });
    writeFileSync(join(repoB, "SKILL.md"), `---\n${skillFrontmatter({ name: "second" })}\n---\n`);
    const pinnedB = makeGitRepo(repoB).sha;

    const registry = buildKnownTapRegistry(
      {
        version: 1,
        taps: [
          sourceFor("second", repoB, "", pinnedB),
          sourceFor("first", repoA, "catalog", pinnedA),
        ],
      },
      { workDir: join(root, "work") },
    );

    expect(registry.map((tap) => tap.name)).toEqual(["first", "second"]);
    expect(registry[0]?.skills.map((skill) => skill.path)).toEqual([
      "skills/alpha",
      "skills/beta",
      "skills/database/schema-review",
    ]);
    expect(registry[0]?.skills[2]?.namespace).toBe("database");
    expect(registry[1]?.skills[0]?.path).toBe("");
    expect(registry[1]?.skills[0]?.namespace).toBeNull();
  });

  test("fails when a curated tap contains invalid skills", () => {
    const root = makeTempDir("crew-known-taps-invalid-");
    const repo = join(root, "repo");
    const skillDir = join(repo, "actual-dir");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: declared-name\n---\n");
    const commit = makeGitRepo(repo).sha;

    expect(() =>
      buildKnownTapRegistry(
        { version: 1, taps: [sourceFor("invalid", repo, "", commit)] },
        { workDir: join(root, "work") },
      ),
    ).toThrow("has an invalid skill");
  });

  test("rejects shortened skills subpath display when repo root is also a skill", () => {
    const root = makeTempDir("crew-known-taps-shadowed-");
    const repo = join(root, "repo");
    mkdirSync(repo, { recursive: true });
    writeFileSync(join(repo, "SKILL.md"), `---\n${skillFrontmatter({ name: "root" })}\n---\n`);
    makeSkill(join(repo, "skills"), "nested", skillFrontmatter({ name: "nested" }));
    const commit = makeGitRepo(repo).sha;

    expect(() =>
      buildKnownTapRegistry(
        { version: 1, taps: [sourceFor("shadowed", repo, "skills", commit)] },
        { workDir: join(root, "work") },
      ),
    ).toThrow("repo root also has a SKILL.md");
  });
});

function validSource(): Record<string, unknown> {
  return {
    name: "alpha",
    url: "https://github.com/example/skills.git",
    subpath: "",
    description: "Alpha skills",
    trust: "curated",
    commit: "0123456789abcdef0123456789abcdef01234567",
  };
}

function sourceFor(
  name: string,
  url: string,
  subpath: string,
  commit: string,
): KnownTapManifest["taps"][number] {
  return {
    name,
    url,
    subpath,
    description: `${name} skills`,
    trust: "curated",
    commit,
  };
}
