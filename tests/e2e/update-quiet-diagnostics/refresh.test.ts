/** Explicitly selected tap refresh failures retain quiet diagnostics (§5.2, §10.1, C-UPD-42). */

import { expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

for (const args of [["update"], ["update", "--dry-run"], ["outdated"]]) {
  test(`C-UPD-42 ${args.join(" ")} shows only named hard refresh failures in quiet mode`, () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-quiet-refresh-");
    makeSkill(repo, "unused", skillFrontmatter({ name: "unused" }));
    makeGitRepo(repo);
    expect(
      runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams }),
    ).toBe(0);
    expect(
      runCli(["tap", "add", `file://${repo}`, "fixture"], {
        home,
        streams: captureStreams().streams,
      }),
    ).toBe(0);
    rmSync(repo, { recursive: true });

    const unnamed = captureStreams();
    expect(runCli([...args, "--quiet"], { home, streams: unnamed.streams })).toBe(0);
    expect(unnamed.stdout()).toBe("");
    expect(unnamed.stderr()).toBe("");

    const normal = captureStreams();
    expect(runCli([...args, "fixture"], { home, streams: normal.streams })).toBe(1);
    expect(normal.stdout()).toContain("couldn't refresh tap fixture");
    expect(normal.stderr()).toBe("");
    const json = captureStreams();
    expect(runCli([...args, "fixture", "--json"], { home, streams: json.streams })).toBe(1);
    const failure = JSON.parse(json.stdout()).tap_rows[0].error;
    const quiet = captureStreams();
    expect(runCli([...args, "fixture", "--quiet"], { home, streams: quiet.streams })).toBe(1);
    expect(quiet.stdout()).toBe("");
    expect(quiet.stderr()).toContain(`tap fixture: failed (${failure.code}):`);
    expect(quiet.stderr()).toContain(repo);
    const jsonQuiet = captureStreams();
    expect(
      runCli([...args, "fixture", "--json", "--quiet"], { home, streams: jsonQuiet.streams }),
    ).toBe(1);
    expect(jsonQuiet.stdout()).toBe(json.stdout());
    expect(jsonQuiet.stderr()).toBe("");
  });
}
