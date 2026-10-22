/** Assets, unvisited layouts, recursive filters, and trusted paths stay quiet (§9, §16.6). */

import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { cli, freshHome, register, source, WARNING } from "./fixtures.ts";

test("C-TAP-08g a root skill prunes assets and every child layout", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const { repo } = source("flat", "nested", false);
  writeFileSync(join(repo, "SKILL.md"), `---\n${skillFrontmatter({ name: "root" })}\n---\n`);
  symlinkSync("absent-layout-target", join(repo, "skills"));
  symlinkSync("absent-root-asset-target", join(repo, "root-asset"));
  commitAll(repo, "root skill takes precedence");
  const registered = register(home, repo, "flat");
  expect(registered.code).toBe(0);
  expect(registered.err).toBe("");
  const result = cli(home, ["search", "--tap", "fixture", "--json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out).hits.map((hit: { name: string }) => hit.name)).toEqual(["root"]);
  expect(JSON.parse(result.out).warnings).toEqual([]);
  expect(result.err).toBe("");
  const preview = cli(home, ["info", "fixture", "--json"]);
  expect(preview.code).toBe(0);
  expect(JSON.parse(preview.out)).not.toHaveProperty("warnings");
  expect(preview.err).toBe("");
});

test("C-TAP-08g skills layout never inspects root siblings or an unused recursive fallback", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const { repo } = source("skills", "healthy", false);
  symlinkSync("absent-root-sibling-target", join(repo, "root-link"));
  const nested = join(repo, "projects", "unvisited");
  mkdirSync(nested, { recursive: true });
  symlinkSync("absent-nested-target", join(nested, "link"));
  commitAll(repo, "unvisited layouts contain links");
  const registered = register(home, repo, "recursive");
  expect(registered.code).toBe(0);
  expect(registered.err).toBe("");
  for (const args of [
    ["search", "--tap", "fixture"],
    ["info", "fixture"],
  ]) {
    const result = cli(home, [...args, "--json"]);
    expect(result.code).toBe(0);
    expect(result.err).toBe("");
    expect(result.out).not.toContain(WARNING);
  }
});

test("C-TAP-08g recursive hidden, vendor, depth and skill pruning produce no warning", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const { repo } = source("recursive", "healthy", false);
  const project = join(repo, "projects");
  for (const name of [".hidden", "vendor", "node_modules"]) {
    symlinkSync("absent-filtered-target", join(project, name));
  }
  const hidden = join(project, ".hidden-directory");
  const deep = join(project, "a", "b", "c", "d");
  for (const parent of [hidden, deep]) {
    mkdirSync(parent, { recursive: true });
    symlinkSync("absent-unvisited-target", join(parent, "excluded"));
  }
  commitAll(repo, "links only in filtered discovery positions");
  const registered = register(home, repo, "recursive");
  expect(registered.code).toBe(0);
  expect(registered.err).toBe("");
  const result = cli(home, ["search", "--tap", "fixture", "--json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out).hits.map((hit: { name: string }) => hit.name)).toEqual(["healthy"]);
  expect(JSON.parse(result.out).warnings).toEqual([]);
  expect(result.err).toBe("");
  const preview = cli(home, ["info", "fixture", "--json"]);
  expect(preview.code).toBe(0);
  expect(JSON.parse(preview.out)).not.toHaveProperty("warnings");
  expect(preview.err).toBe("");
});

test("C-TAP-08g path-kind standard links remain discoverable without a Git warning", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const { repo } = source("flat", "healthy", false);
  const external = makeSkill(
    makeTempDir("crew-trusted-link-"),
    "linked",
    skillFrontmatter({ name: "linked" }),
  );
  symlinkSync(external, join(repo, "trusted-link"));
  expect(cli(home, ["tap", "add", repo, "fixture"]).code).toBe(0);
  const result = cli(home, ["search", "--tap", "fixture", "--json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out).hits.map((hit: { name: string }) => hit.name)).toEqual([
    "healthy",
    "linked",
  ]);
  expect(JSON.parse(result.out).warnings).toEqual([]);
  expect(result.err).toBe("");
  const preview = cli(home, ["info", "fixture", "--json"]);
  expect(preview.code).toBe(0);
  expect(JSON.parse(preview.out)).not.toHaveProperty("warnings");
});

test("C-TAP-08g path-kind recursive exclusions do not gain a Git warning", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const { repo } = source("recursive");
  expect(cli(home, ["tap", "add", "--recursive", repo, "fixture"]).code).toBe(0);
  const result = cli(home, ["search", "--tap", "fixture", "--json"]);
  expect(result.code).toBe(0);
  expect(JSON.parse(result.out).warnings).toEqual([]);
  expect(result.err).toBe("");
});

test("C-TAP-08g fatal reference errors retain their existing JSON contract", () => {
  const { home, reset } = freshHome();
  expect(reset.code).toBe(0);
  const { repo } = source("flat");
  symlinkSync("healthy", join(repo, "linked-root"));
  commitAll(repo, "explicit linked subpath remains refused");
  const registered = register(home, repo, "flat");
  expect(registered.code).toBe(0);
  expect(registered.err).toBe("");
  for (const ref of ["fixture/missing", `file://${repo}//linked-root`]) {
    const result = cli(home, ["info", ref, "--json"]);
    expect(result.code).toBe(4);
    expect(JSON.parse(result.out).error.name).toBe("invalid_ref");
    expect(JSON.parse(result.out)).not.toHaveProperty("warnings");
    expect(result.out).not.toContain(WARNING);
    expect(result.err).toBe("");
  }
});
