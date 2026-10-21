/** Gist file discovery and byte-preserving installs (§9; C-GIST-01/02). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { readState } from "../../../src/state/load.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { GIST_URL, gistFile, gistFixture } from "./helpers.ts";

const saved = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
let target: string;
beforeEach(() => {
  target = makeTempDir("crew-gist-target-");
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => target;
    adapter.projectPath = () => target;
    adapter.detect = () => true;
  }
});
afterEach(() => {
  for (const { adapter, ...original } of saved) Object.assign(adapter, original);
  resetGitRunner();
});
test("C-GIST-01 arbitrary files install exact bytes with original marker paths", () => {
  const f = gistFixture();
  writeFileSync(join(f.repo, "README"), "ordinary text");
  const result = f.cli("install", GIST_URL);
  expect(result.code).toBe(0);
  expect(
    readState(f.home)
      .installations.map((e) => [e.name, e.source.path])
      .sort(),
  ).toEqual([
    ["build", "build.txt"],
    ["prd", "prd.md"],
  ]);
  for (const [name, filename] of [
    ["prd", "prd.md"],
    ["build", "build.txt"],
  ]) {
    expect(readFileSync(join(target, name!, "SKILL.md"), "utf8")).toBe(
      readFileSync(join(f.repo, filename!), "utf8"),
    );
    expect(readdirSync(join(target, name!)).sort()).toEqual([".crew.json", "SKILL.md"]);
    expect(JSON.parse(readFileSync(join(target, name!, ".crew.json"), "utf8")).path).toBe(filename);
  }
});

test("C-GIST-02 names SKILL.md, skills and .crew.json are regular-file candidates", () => {
  const f = gistFixture({ "SKILL.md": "root", skills: "build", ".crew.json": "marker" });
  expect(f.cli("install", GIST_URL).code).toBe(0);
  expect(
    readState(f.home)
      .installations.map((e) => e.source.path)
      .sort(),
  ).toEqual([".crew.json", "SKILL.md", "skills"]);
});
test("C-GIST-02 invalid files, directories and symlinks are ignored", () => {
  const f = gistFixture();
  writeFileSync(join(f.repo, "bad.md"), "---\nname: bad\ndescription: []\n---\n");
  writeFileSync(join(f.repo, "unclosed"), "---\nname: broken\n");
  writeFileSync(join(f.repo, "README"), "ordinary text");
  makeSkill(f.repo, "directory", skillFrontmatter({ name: "directory" }));
  symlinkSync("prd.md", join(f.repo, "linked.md"));
  commitAll(f.repo, "noncandidates");
  expect(f.cli("install", GIST_URL).code).toBe(0);
  expect(
    readState(f.home)
      .installations.map((e) => e.name)
      .sort(),
  ).toEqual(["build", "prd"]);
});
test("C-GIST-02 empty valid sets use no_skills_found", () => {
  const f = gistFixture({});
  writeFileSync(join(f.repo, "bad"), "---\nname: bad\n---\n");
  commitAll(f.repo, "invalid");
  const result = f.cli("install", GIST_URL);
  expect(result.code).toBe(4);
  expect(result.err).toContain("no_skills_found");
  expect(f.cli("info", GIST_URL).err).toContain("no_skills_found");
});
test("C-GIST-02 duplicate declared names conflict", () => {
  const f = gistFixture({ one: "same", two: "same" });
  const result = f.cli("install", GIST_URL);
  expect(result.code).toBe(4);
  expect(result.err).toContain("conflicting_dependencies");
  expect(readState(f.home).installations).toEqual([]);
});
test("C-GIST-05 bare dependencies resolve other valid files at the parent commit", () => {
  const f = gistFixture();
  gistFile(f.repo, "prd.md", "prd", ["build"]);
  const sha = commitAll(f.repo, "dependency");
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  expect(f.cli("install", `snippets/prd@${sha}`).code).toBe(0);
  const entries = readState(f.home).installations;
  expect(entries.map((e) => e.name)).toEqual(["build", "prd"]);
  const dep = entries[0]!;
  expect(dep.source.path).toBe("build.txt");
  expect(dep.resolved_sha).toBe(sha);
  expect(dep.ref).toBe(sha);
  expect(dep.explicit).toBe(false);
  expect(dep.required_by).toEqual(["prd"]);
});

test("C-GIST-01 selected files preserve non-UTF-8 body bytes", () => {
  const f = gistFixture({});
  const bytes = Buffer.concat([
    Buffer.from("---\nname: binary\ndescription: binary\n---\n"),
    Buffer.from([0xff, 0, 0xe2, 0x82]),
  ]);
  writeFileSync(join(f.repo, "bytes"), bytes);
  commitAll(f.repo, "binary body");
  expect(f.cli("install", GIST_URL).code).toBe(0);
  expect(readFileSync(join(target, "binary", "SKILL.md"))).toEqual(bytes);
});
test("C-GIST-05 bare dependencies can fall through to another configured tap", () => {
  const f = gistFixture();
  gistFile(f.repo, "prd.md", "prd", ["external"]);
  commitAll(f.repo, "external dependency");
  const external = makeSkill(makeTempDir(), "external", skillFrontmatter({ name: "external" }));
  expect(f.cli("tap", "add", external, "other").code).toBe(0);
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  expect(f.cli("install", "snippets/prd").code).toBe(0);
  expect(readState(f.home).installations.map((e) => e.name)).toEqual(["external", "prd"]);
});
test("C-GIST-05 duplicate gist siblings use conflicting_dependencies", () => {
  const f = gistFixture({ "prd.md": "prd", first: "build", second: "build" });
  gistFile(f.repo, "prd.md", "prd", ["build"]);
  commitAll(f.repo, "ambiguous dependency");
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  expect(f.cli("install", "snippets/prd").err).toContain("conflicting_dependencies");
});
