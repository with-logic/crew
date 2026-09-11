/**
 * `crew list` / `crew info` source labels (§5.1 "Source labels", §9.1).
 *
 * C-LIST-07 and C-INFO-02: a one-off install from a git URL creates an
 * auto tap whose name crew derived, and neither command should echo that
 * derived name back as the source.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
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
  test("C-LIST-07 list shows the repo reference, not the derived auto-tap name", () => {
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

  test("C-LIST-07 --json keeps the raw tap and path unchanged", () => {
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
    expect(payload.installations[0]!.source.tap).not.toBe(`${url}//skills/demo`);
    expect(typeof payload.installations[0]!.source.path).toBe("string");
  });

  test("C-LIST-07 a registered tap still shows its configured name", () => {
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
