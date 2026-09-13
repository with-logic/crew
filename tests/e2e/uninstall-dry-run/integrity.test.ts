/**
 * `crew uninstall --dry-run` writes nothing (§7.4, C-UNINST-19/19a).
 *
 * Every physical artefact a real uninstall would touch is captured as
 * raw bytes before the run and compared after: both agents' install
 * directories and markers, `state.json`, `config.yaml`, and the
 * backing auto-tap clone.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { paths, tapPath } from "../../../src/core/paths.ts";
import { setReleaseFetcher } from "../../../src/self-update/github.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { ccRoot, coRoot, installFooWithDepBar, useRedirectedAdapters } from "./helpers.ts";

useRedirectedAdapters();

/** Raw bytes of every file a real uninstall would rewrite or delete. */
function snapshot(home: string): Map<string, Buffer> {
  const files = [
    paths(home).stateFile,
    paths(home).configFile,
    join(ccRoot, "foo", ".crew.json"),
    join(ccRoot, "foo", "SKILL.md"),
    join(coRoot, "foo", ".crew.json"),
    join(coRoot, "foo", "SKILL.md"),
  ];
  const out = new Map<string, Buffer>();
  for (const f of files) out.set(f, readFileSync(f));
  return out;
}

describe("crew uninstall --dry-run integrity", () => {
  test("C-UNINST-19 leaves both agents, state, and config byte-identical", () => {
    const home = makeCrewHome();
    installFooWithDepBar(home);
    // Raw bytes, not parsed-and-reserialized: a write that changed
    // formatting or key order would slip past a JSON comparison.
    const before = snapshot(home);

    const out = captureStreams();
    const code = runCli(["uninstall", "--dry-run", "foo"], { home, streams: out.streams });

    expect(code).toBe(0);
    expect(out.stdout()).toContain("Uninstalling foo (dry run)");
    expect(out.stdout()).toContain("[ok] claude-code");
    expect(out.stdout()).toContain("[ok] codex");
    expect(out.stdout()).toContain("would remove from 2 agents");
    for (const [file, bytes] of before) {
      expect(readFileSync(file).equals(bytes)).toBe(true);
    }
  });

  test("C-UNINST-19a a dry run against a fresh home does not create state.json", () => {
    // `makeCrewHome()` creates the directory; use a path inside it that
    // crew has never touched, so nothing exists before the run.
    const home = join(makeCrewHome(), "untouched");
    const stateFile = paths(home).stateFile;
    expect(existsSync(home)).toBe(false);

    const out = captureStreams();
    // Nothing is installed, so the selector misses; `--force` turns the
    // miss into a no-op so we exercise the write-free path end to end.
    const code = runCli(["uninstall", "--dry-run", "--force", "ghost"], {
      home,
      streams: out.streams,
    });

    expect(code).toBe(0);
    expect(existsSync(stateFile)).toBe(false);
    expect(existsSync(`${stateFile}.lock`)).toBe(false);
    expect(existsSync(home)).toBe(false);
  });

  test("C-UNINST-19a a dry run on a TTY does not write the version-check cache", () => {
    // The other write-free tests use captured streams, which are never a
    // TTY, so the §10.4 update notice suppresses itself and its stale
    // branch — the one that fetches and writes `version-check.json` — is
    // never reached. Only a TTY invocation exercises it.
    const home = makeCrewHome();
    let fetches = 0;
    const previous = setReleaseFetcher(() => {
      fetches++;
      return { tag: "v99.0.0", assets: {} };
    });
    try {
      const code = runCli(["uninstall", "--dry-run", "--force", "ghost"], {
        home,
        streams: captureStreams().streams,
        stderrIsTty: true,
      });

      expect(code).toBe(0);
      // No fetch attempted and no cache written: a preview reads only.
      expect(fetches).toBe(0);
      expect(existsSync(paths(home).versionCheckFile)).toBe(false);
    } finally {
      setReleaseFetcher(previous);
    }
  });

  test("C-UNINST-19 a dry run never garbage-collects the backing auto tap", () => {
    const home = makeCrewHome();
    const repo = makeTempDir("crew-repo-");
    makeSkill(repo, "solo", skillFrontmatter({ name: "solo" }));
    makeGitRepo(repo);
    expect(runCli(["install", `file://${repo}`], { home, streams: captureStreams().streams })).toBe(
      0,
    );
    const tapsBefore = readConfig(home).taps.map((t) => t.name);
    expect(tapsBefore.length).toBeGreaterThan(1);
    const autoTap = readConfig(home).taps.find((t) => !t.registered);
    const clone = tapPath(autoTap?.name ?? "", home);
    const configBefore = readFileSync(paths(home).configFile);
    expect(existsSync(clone)).toBe(true);

    const code = runCli(["uninstall", "--dry-run", "solo"], {
      home,
      streams: captureStreams().streams,
    });

    expect(code).toBe(0);
    expect(readConfig(home).taps.map((t) => t.name)).toEqual(tapsBefore);
    // The clone itself must survive, not merely its config row.
    expect(existsSync(clone)).toBe(true);
    expect(readFileSync(paths(home).configFile).equals(configBefore)).toBe(true);
  });
});
