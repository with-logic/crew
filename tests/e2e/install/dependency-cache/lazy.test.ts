/** Only bare dependencies of ref-carrying git parents need captured trees (§9 steps 3, 6). */

import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../../src/config/load.ts";
import { resetGitRunner } from "../../../../src/git/exec.ts";
import { resolveInstallSet } from "../../../../src/install/resolve/index.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import {
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../../helpers/fixtures.ts";
import { captureExports } from "./helpers.ts";

afterEach(() => resetGitRunner());

for (const git of [false, true]) {
  test(`no-ref directory dependencies do not export a parent tree (git=${git})`, () => {
    const repo = makeTempDir("crew-dependency-lazy-");
    makeSkill(repo, "parent", skillFrontmatter({ name: "parent", dependencies: ["dep"] }));
    makeSkill(repo, "dep", skillFrontmatter({ name: "dep" }), "live bytes\n");
    if (git) makeGitRepo(repo);
    const home = makeCrewHome();
    const { roots } = captureExports();
    const result = resolveInstallSet(
      [git ? `file://${repo}//parent` : join(repo, "parent")],
      readConfig(home),
      { home },
    );
    const dep = result.skills.find((skill) => skill.name === "dep")!;
    expect(readFileSync(join(dep.storePath, "SKILL.md"), "utf8")).toEndWith("live bytes\n");
    expect(dep.ref).toBeNull();
    expect(roots).toHaveLength(0);
  });
}

test("an explicit git parent with only a path dependency does not export a dependency tree", () => {
  const dependency = makeSkill(makeTempDir(), "dep", skillFrontmatter({ name: "dep" }));
  const repo = makeTempDir("crew-dependency-qualified-");
  makeSkill(repo, "parent", skillFrontmatter({ name: "parent", dependencies: [dependency] }));
  const { sha } = makeGitRepo(repo);
  const home = makeCrewHome();
  const config = readConfig(home);
  const withDependency = {
    ...config,
    taps: [
      ...config.taps,
      {
        name: "dependency",
        kind: "path" as const,
        registered: true,
        url: "",
        subpath: "",
        path: dependency,
      },
    ],
  };
  const { roots } = captureExports();
  const result = resolveInstallSet([`file://${repo}@${sha}//parent`], withDependency, { home });
  expect(result.skills.map((skill) => skill.name)).toEqual(["dep", "parent"]);
  expect(roots).toHaveLength(1);
  expect(existsSync(roots[0]!)).toBe(false);
});
