/**
 * `crew list` / `crew info` source labels (§5.1 "Source labels", §9.1).
 *
 * C-LIST-08 and C-INFO-02: a one-off install from a git URL creates an
 * auto tap whose name crew derived, and neither command should echo that
 * derived name back as the source.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../src/config/load.ts";
import { readState, writeState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let ccUser: string;
let originals: { user: () => string; detect: () => boolean };

beforeEach(() => {
  ccUser = makeTempDir("crew-cc-");
  originals = { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccUser;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.user;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
});

const quiet = () => captureStreams().streams;

/** A repo with `skills/demo/SKILL.md`, returned as a `file://` URL. */
function makeSubpathRepo(): { url: string; path: string } {
  const repo = makeTempDir("crew-repo-");
  const skillsDir = join(repo, "skills");
  mkdirSync(skillsDir, { recursive: true });
  makeSkill(skillsDir, "demo", skillFrontmatter({ name: "demo", description: "A demo skill." }));
  makeGitRepo(repo, "init");
  return { url: `file://${repo}`, path: repo };
}

describe("source labels", () => {
  test("C-LIST-08 list shows the repo reference, not the derived auto-tap name", () => {
    const home = makeCrewHome();
    const { url } = makeSubpathRepo();
    expect(
      runCli(["install", `${url}//skills/demo`, "--agent", "claude-code"], {
        home,
        streams: quiet(),
      }),
    ).toBe(0);

    const cap = captureStreams();
    expect(runCli(["list"], { home, streams: cap.streams })).toBe(0);
    const out = cap.stdout();

    expect(out).toContain(`${url}//skills/demo`);
    // The derived tap name for this install is `demo`; the whole point
    // is that the user sees the reference instead.
    expect(out).not.toContain("  demo  demo  ");
  });

  test("C-LIST-08 --json keeps the raw tap and path unchanged", () => {
    const home = makeCrewHome();
    const { url } = makeSubpathRepo();
    runCli(["install", `${url}//skills/demo`, "--agent", "claude-code"], {
      home,
      streams: quiet(),
    });

    const cap = captureStreams();
    expect(runCli(["list", "--json"], { home, streams: cap.streams })).toBe(0);
    const payload = JSON.parse(cap.stdout()) as {
      installations: { source: { tap: string; path: string } }[];
    };

    expect(payload.installations).toHaveLength(1);
    // Compare against what state actually stores, so this fails if the
    // label ever leaks into the machine-readable payload — asserting
    // only "not the URL" would pass on any wrong value.
    const stored = readState(home).installations[0]!;
    expect(payload.installations[0]!.source).toEqual({
      tap: stored.source.tap,
      path: stored.source.path,
    });
    // The install named `<url>//skills/demo`, so the subpath belongs to the
    // auto tap and the entry's own path is empty. Pinning both keeps the
    // comparison above from passing vacuously. The tap name is derived from
    // a randomized temp directory, so match its shape rather than a literal.
    expect(stored.source.tap).toMatch(/-demo$/);
    expect(stored.source.tap).not.toContain("://");
    expect(stored.source.path).toBe("");
  });

  test("C-LIST-08 a registered tap still shows its configured name", () => {
    const home = makeCrewHome();
    const { url } = makeSubpathRepo();
    expect(runCli(["tap", "add", `${url}//skills`, "acme"], { home, streams: quiet() })).toBe(0);
    expect(
      runCli(["install", "acme/demo", "--agent", "claude-code"], { home, streams: quiet() }),
    ).toBe(0);

    const cap = captureStreams();
    expect(runCli(["list"], { home, streams: cap.streams })).toBe(0);
    expect(cap.stdout()).toContain("acme");
    expect(cap.stdout()).not.toContain(url);
  });

  test("C-INFO-02 info shows the label and names the auto tap", () => {
    const home = makeCrewHome();
    const { url } = makeSubpathRepo();
    runCli(["install", `${url}//skills/demo`, "--agent", "claude-code"], {
      home,
      streams: quiet(),
    });

    const cap = captureStreams();
    expect(runCli(["info", "demo"], { home, streams: cap.streams })).toBe(0);
    const out = cap.stdout();

    expect(out).toContain(`${url}//skills/demo`);
    // The tap name stays visible — it's the argument `crew tap remove` takes.
    expect(out).toMatch(/\(tap \S+\)/);
  });

  test("C-INFO-02 --json carries the rendered label as source_label", () => {
    const home = makeCrewHome();
    const { url } = makeSubpathRepo();
    runCli(["install", `${url}//skills/demo`, "--agent", "claude-code"], {
      home,
      streams: quiet(),
    });

    const cap = captureStreams();
    expect(runCli(["info", "demo", "--json"], { home, streams: cap.streams })).toBe(0);
    const payload = JSON.parse(cap.stdout()) as { source_label: string };

    expect(payload.source_label).toBe(`${url}//skills/demo`);
  });

  test("C-INFO-02 a malformed persisted tap name is escaped, not emitted raw", () => {
    const home = makeCrewHome();
    const { url } = makeSubpathRepo();
    runCli(["install", `${url}//skills/demo`, "--agent", "claude-code"], {
      home,
      streams: quiet(),
    });

    // A tap name is persisted config, so it can carry anything a hand edit
    // or a future derivation puts there. `sourceLabel` is already escaped;
    // the parenthetical tap name reaches the terminal on its own path.
    const esc = String.fromCharCode(27);
    const config = readConfig(home);
    const auto = config.taps.find((t) => !t.registered);
    if (!auto) throw new Error("expected an auto tap");
    const evil = `${auto.name}${esc}[2K`;
    writeConfig(
      { ...config, taps: config.taps.map((t) => (t.registered ? t : { ...t, name: evil })) },
      home,
    );
    const state = readState(home);
    writeState(
      {
        ...state,
        installations: state.installations.map((e) => ({
          ...e,
          source: { ...e.source, tap: evil },
        })),
      },
      home,
    );

    const cap = captureStreams();
    expect(runCli(["info", "demo"], { home, streams: cap.streams })).toBe(0);
    const out = cap.stdout();

    expect(out).not.toContain(esc);
    expect(out).toContain("\\x1b");
  });

  test("C-INFO-02 a registered tap shows its name with no parenthetical", () => {
    const home = makeCrewHome();
    const { url } = makeSubpathRepo();
    runCli(["tap", "add", `${url}//skills`, "acme"], { home, streams: quiet() });
    runCli(["install", "acme/demo", "--agent", "claude-code"], { home, streams: quiet() });

    const cap = captureStreams();
    expect(runCli(["info", "demo"], { home, streams: cap.streams })).toBe(0);
    expect(cap.stdout()).not.toMatch(/\(tap \S+\)/);
  });
});
