/** Pruning retains refused orphans, continues, and reports failure (§7.4). */

import { expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { ccRoot, installFooWithDepBar, useRedirectedAdapters } from "./helpers.ts";

useRedirectedAdapters();

for (const dryRun of [true, false]) {
  test(`C-UNINST-19 prune terminates after a safety failure (dry-run=${dryRun})`, () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);
    const source = makeTempDir();
    makeSkill(source, "baz", skillFrontmatter({ name: "baz" }));
    expect(
      runCli(["install", join(source, "baz")], { home, streams: captureStreams().streams }),
    ).toBe(0);
    const state = readState(home);
    writeState(
      {
        ...state,
        installations: state.installations.map((e) =>
          e.name === "baz" ? { ...e, explicit: false } : e,
        ),
      },
      home,
    );
    const before = readState(home);
    rmSync(join(ccRoot, "bar", ".crew.json"));

    const output = captureStreams();
    const code = runCli(
      ["uninstall", "--prune", "--json", ...(dryRun ? ["--dry-run"] : []), "foo"],
      { home, streams: output.streams },
    );

    expect(code).toBe(1);
    const payload = JSON.parse(output.stdout());
    expect(payload.records.map((r: { name: string }) => r.name)).toEqual(["foo", "bar", "baz"]);
    expect(payload.records[1].failures[0].error.code).toBe("untracked_directory");
    expect(payload.records[1].remainingAgents).toEqual(["claude-code"]);
    expect(existsSync(join(ccRoot, "bar", "SKILL.md"))).toBe(true);
    expect(existsSync(join(ccRoot, "baz"))).toBe(dryRun);
    if (dryRun) expect(readState(home)).toEqual(before);
    else expect(readState(home).installations.map((e) => e.name)).toEqual(["bar"]);
  });
}
