/** Live git tap acquisition and indexing retain directory failure identity (§9, §16.6). */

import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { acquireTap } from "../../../src/sources/acquire/index.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  cloneDirForTap,
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

for (const mode of [0o111, 0o444]) {
  test(`git tap discovery reports inaccessible materialized directories (${mode.toString(8)})`, () => {
    const home = makeCrewHome();
    const repo = makeTempDir();
    makeGitRepo(repo);
    makeSkill(join(repo, "collection"), "demo", skillFrontmatter({ name: "demo" }));
    commitAll(repo, "add collection");
    expect(
      runCli(["tap", "add", `file://${repo}//collection`, "local"], {
        home,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    const tap = readConfig(home).taps.find((candidate) => candidate.name === "local")!;
    const blocked = join(cloneDirForTap("local", home)!, "collection");
    chmodSync(blocked, mode);
    try {
      if (mode === 0o444)
        expect(() => acquireTap(tap, home)).toThrow(
          expect.objectContaining({
            code: "source_unreachable",
            details: { path: blocked },
          }),
        );
      const capture = captureStreams();
      expect(
        runCli(["search", "--tap", "local", "--json"], { home, streams: capture.streams }),
      ).toBe(0);
      const result = JSON.parse(capture.stdout());
      expect(result.hits).toEqual([]);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("source_unreachable");
      expect(result.warnings[0]).toContain(blocked);
    } finally {
      chmodSync(blocked, 0o755);
    }
  });
}
