/** Gist taps, previews and updates share file layout (§9, §10, §16). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { readConfig } from "../../../src/config/load.ts";
import { resetGitRunner } from "../../../src/git/exec.ts";
import { countSkills } from "../../../src/install/collision-check.ts";
import { readState } from "../../../src/state/load.ts";
import { commitAll, makeTempDir } from "../../helpers/fixtures.ts";
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
test("C-GIST-03 tap search, info, qualified install and direct preview find all files", () => {
  const f = gistFixture({ "SKILL.md": "prd", "build.md": "build" });
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  expect(countSkills(readConfig(f.home).taps.find((tap) => tap.name === "snippets")!, f.home)).toBe(
    2,
  );
  const search = f.cli("search", "--tap", "snippets", "--json");
  expect(search.code).toBe(0);
  expect(JSON.parse(search.out).hits.map((hit: { name: string }) => hit.name)).toEqual([
    "build",
    "prd",
  ]);
  const info = f.cli("info", "snippets/build");
  expect(info.code).toBe(0);
  expect(info.out).toContain("build");
  expect(f.cli("info", GIST_URL).out).toContain("prd");
  expect(f.cli("info", "snippets").out).toContain("build");
  expect(f.cli("install", "--dry-run", "snippets/build").code).toBe(0);
  expect(readState(f.home).installations).toEqual([]);
  expect(f.cli("install", "snippets/build").code).toBe(0);
  expect(readState(f.home).installations.map((e) => [e.name, e.source.path])).toEqual([
    ["build", "build.md"],
  ]);
});
test("C-GIST-04 whole-gist updates change bytes, add files and preserve deleted copies", () => {
  const f = gistFixture();
  expect(f.cli("install", GIST_URL).code).toBe(0);
  writeFileSync(join(f.repo, "prd.md"), `${readFileSync(join(f.repo, "prd.md"), "utf8")}changed\n`);
  const next = gistFile(f.repo, "new.anything", "new");
  rmSync(join(f.repo, "build.txt"));
  commitAll(f.repo, "updated gist");
  const preview = f.cli("update", "--dry-run");
  expect(preview.code).toBe(0);
  expect(preview.out).toContain("new");
  expect(readState(f.home).installations).toHaveLength(2);
  const update = f.cli("update");
  expect(update.code).toBe(0);
  expect(update.out).toContain("removed upstream");
  expect(readFileSync(join(target, "prd", "SKILL.md"), "utf8")).toContain("changed");
  expect(readFileSync(join(target, "new", "SKILL.md"), "utf8")).toBe(next);
  expect(readFileSync(join(target, "build", "SKILL.md"), "utf8")).toContain("Original build");
  expect(
    readState(f.home)
      .installations.map((e) => e.name)
      .sort(),
  ).toEqual(["build", "new", "prd"]);
  expect(f.cli("update").out).toContain("up to date");
});
test("C-GIST-03 refs preview and update files at their selected commit", () => {
  const f = gistFixture();
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  const original = readFileSync(join(f.repo, "prd.md"), "utf8");
  rmSync(join(f.repo, "prd.md"));
  commitAll(f.repo, "remove from head");
  expect(f.cli("tap", "update", "snippets").code).toBe(0);
  expect(f.cli("info", `snippets/prd@${f.sha}`).code).toBe(0);
  expect(f.cli("install", `snippets/prd@${f.sha}`).code).toBe(0);
  expect(readFileSync(join(target, "prd", "SKILL.md"), "utf8")).toBe(original);
  expect(f.cli("update", "--force", "prd").code).toBe(0);
  expect(readFileSync(join(target, "prd", "SKILL.md"), "utf8")).toBe(original);
  expect(readState(f.home).installations[0]!.pinned).toBe(true);
});
test("C-GIST-04 a tracked filename becoming a directory is refused", () => {
  const f = gistFixture();
  expect(f.cli("tap", "add", GIST_URL, "snippets").code).toBe(0);
  expect(f.cli("install", "snippets/prd").code).toBe(0);
  rmSync(join(f.repo, "prd.md"));
  mkdirSync(join(f.repo, "prd.md"));
  writeFileSync(
    join(f.repo, "prd.md", "SKILL.md"),
    "---\nname: prd\ndescription: replacement\n---\n",
  );
  commitAll(f.repo, "replace file with directory");
  const update = f.cli("update", "prd", "--json");
  expect(update.code).toBe(1);
  expect(JSON.parse(update.out).rows[0].outcome.error.message).toContain("regular file");
  expect(readFileSync(join(target, "prd", "SKILL.md"), "utf8")).toContain("Original prd");
});
