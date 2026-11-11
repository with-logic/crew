/**
 * Locating and reading a project manifest (§9.2): which `.crewrc` governs
 * a directory, and what is refused. Real files, real symlinks.
 */
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CrewError } from "../../src/core/errors.ts";
import { loadManifestFor, MANIFEST_FILENAME } from "../../src/manifest/index.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

/** A directory tree `<root>/<sub>` with a manifest holding `lines` at the root. */
function project(lines: readonly string[], sub: string = ""): { root: string; cwd: string } {
  const root = makeTempDir("crew-proj-");
  writeFileSync(join(root, MANIFEST_FILENAME), lines.map((l) => `${l}\n`).join(""));
  const cwd = join(root, sub);
  mkdirSync(cwd, { recursive: true });
  return { root, cwd };
}

function rejection(cwd: string): CrewError {
  try {
    loadManifestFor(cwd);
  } catch (err) {
    return err as CrewError;
  }
  throw new Error("expected loadManifestFor to throw");
}

describe("loadManifestFor: which manifest governs", () => {
  test("a manifest in the directory itself is used, and its directory is the project root", () => {
    const { root, cwd } = project(["@acme/skills"]);
    const manifest = loadManifestFor(cwd);
    expect(manifest?.file).toBe(join(root, MANIFEST_FILENAME));
    expect(manifest?.projectRoot).toBe(root);
    expect(manifest?.entries.map((e) => e.ref)).toEqual(["@acme/skills"]);
  });

  test("from a subdirectory, the nearest manifest above governs", () => {
    const { root, cwd } = project(["@acme/outer"], "packages/api/src");
    writeFileSync(join(root, "packages", "api", MANIFEST_FILENAME), "@acme/inner\n");
    const manifest = loadManifestFor(cwd);
    expect(manifest?.projectRoot).toBe(join(root, "packages", "api"));
    expect(manifest?.entries.map((e) => e.ref)).toEqual(["@acme/inner"]);
  });

  test("an empty manifest still governs: it is not passed over for the one above", () => {
    const { root, cwd } = project(["@acme/outer"], "packages/api");
    writeFileSync(join(cwd, MANIFEST_FILENAME), "");
    const manifest = loadManifestFor(cwd);
    expect(manifest?.projectRoot).toBe(join(root, "packages", "api"));
    expect(manifest?.entries).toEqual([]);
  });

  test("there is no manifest when none exists up to the filesystem root", () => {
    expect(loadManifestFor(makeTempDir("crew-bare-"))).toBeNull();
  });

  for (const kind of ["directory", "file"] as const) {
    test(`a manifest above a repository root (.git ${kind}) does not govern the repository`, () => {
      const { root, cwd } = project(["@acme/skills"], "repo/src");
      // A clone's `.git` is a directory; a worktree's is a file.
      if (kind === "directory") mkdirSync(join(root, "repo", ".git"));
      else writeFileSync(join(root, "repo", ".git"), "gitdir: elsewhere\n");
      expect(loadManifestFor(cwd)).toBeNull();
    });
  }

  test("a manifest at the repository root itself governs", () => {
    const { root, cwd } = project(["@acme/skills"], "src");
    mkdirSync(join(root, ".git"));
    expect(loadManifestFor(cwd)?.projectRoot).toBe(root);
  });
});

describe("loadManifestFor: what is not a manifest", () => {
  test("a directory named .crewrc is skipped in favor of the manifest above it", () => {
    const { root, cwd } = project(["@acme/skills"], "packages");
    mkdirSync(join(cwd, MANIFEST_FILENAME));
    expect(loadManifestFor(cwd)?.projectRoot).toBe(root);
  });

  test("a symbolic link named .crewrc is skipped and its target is never read", () => {
    const { root, cwd } = project(["@acme/skills"], "packages");
    const target = join(makeTempDir("crew-secret-"), "secrets.env");
    writeFileSync(target, "API_TOKEN=do-not-read\n");
    symlinkSync(target, join(cwd, MANIFEST_FILENAME));
    // Were the link followed, its contents would be parsed and rejected.
    expect(loadManifestFor(cwd)?.projectRoot).toBe(root);
  });

  test("an unreadable .crewrc is an error, not a reason to use the manifest above it", () => {
    const { cwd } = project(["@acme/skills"], "packages");
    const file = join(cwd, MANIFEST_FILENAME);
    writeFileSync(file, "@acme/inner\n");
    chmodSync(file, 0o000);
    const err = rejection(cwd);
    expect(err.code).toBe("source_unreachable");
    expect(err.details).toEqual({ file });
    expect(err.remedy).toContain("readable");
  });
});

describe("loadManifestFor: physical containment of path lines", () => {
  test("a path that leaves the project through a symlinked directory is manifest_invalid", () => {
    const { root, cwd } = project(["./tools/ok", "./linked/skill"]);
    symlinkSync(makeTempDir("crew-outside-"), join(root, "linked"));
    mkdirSync(join(root, "linked", "skill"));
    const err = rejection(cwd);
    expect(err.code).toBe("manifest_invalid");
    expect(err.details).toEqual({
      file: join(root, MANIFEST_FILENAME),
      line: 2,
      ref: "./linked/skill",
    });
  });

  test("a path through a symlink to the project's own parent is manifest_invalid", () => {
    const { root, cwd } = project(["./up"]);
    symlinkSync(join(root, ".."), join(root, "up"));
    expect(rejection(cwd).code).toBe("manifest_invalid");
  });

  test("a symlink that stays inside the project is accepted", () => {
    const { root, cwd } = project(["./alias/skill"]);
    mkdirSync(join(root, "tools", "skill"), { recursive: true });
    symlinkSync(join(root, "tools"), join(root, "alias"));
    expect(loadManifestFor(cwd)?.entries.map((e) => e.ref)).toEqual(["./alias/skill"]);
  });

  test("a path that does not exist is accepted here and left for the install flow to report", () => {
    const { cwd } = project(["./tools/absent"]);
    expect(loadManifestFor(cwd)?.entries.map((e) => e.ref)).toEqual(["./tools/absent"]);
  });
});
