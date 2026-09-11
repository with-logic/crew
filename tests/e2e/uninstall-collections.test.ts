/**
 * `crew uninstall` collection selectors and `--all` (§5.3.1, §7.4).
 *
 * Covers C-UNINST-19..24: a tap or namespace name removes everything
 * installed from it, an installed skill name still wins, ambiguity is
 * reported, and `--all` is gated behind a confirmation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import type { ConfirmOutcome } from "../../src/cli/prompt.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

let ccUser: string;
let originals: { user: () => string; project: (c: string) => string; detect: () => boolean };

beforeEach(() => {
  ccUser = makeTempDir("crew-cc-");
  originals = {
    user: claudeCodeAdapter.userPath,
    project: claudeCodeAdapter.projectPath,
    detect: claudeCodeAdapter.detect,
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccUser;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
    join(c, ".claude", "skills");
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.user;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = originals.project;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
});

const quiet = () => captureStreams().streams;

/** A git tap whose `skills/` root holds the given namespace → skills layout. */
function buildTap(prefix: string, layout: Record<string, readonly string[]>): string {
  const repo = makeTempDir(prefix);
  const skillsDir = join(repo, "skills");
  mkdirSync(skillsDir);
  for (const [ns, skills] of Object.entries(layout)) {
    if (ns === ".") {
      for (const name of skills) makeSkill(skillsDir, name, skillFrontmatter({ name }));
      continue;
    }
    const nsDir = join(skillsDir, ns);
    mkdirSync(nsDir);
    for (const name of skills) makeSkill(nsDir, name, skillFrontmatter({ name }));
  }
  makeGitRepo(repo);
  return `file://${repo}`;
}

function addTap(home: string, url: string, name: string): void {
  if (runCli(["tap", "add", url, name], { home, streams: quiet() }) !== 0) {
    throw new Error(`tap add ${name} failed`);
  }
}

function installed(home: string): string[] {
  return readState(home)
    .installations.map((e) => e.name)
    .sort();
}

/** A prompt stub returning a fixed answer, recording how often it ran. */
function stubPrompt(answer: ConfirmOutcome): { fn: () => ConfirmOutcome; calls: () => number } {
  let calls = 0;
  return {
    fn: () => {
      calls++;
      return answer;
    },
    calls: () => calls,
  };
}

describe("collection selectors", () => {
  test("C-UNINST-19 a tap name removes every skill installed from that tap", () => {
    const home = makeCrewHome();
    addTap(home, buildTap("crew-acme-", { ".": ["alpha", "beta"] }), "acme");
    addTap(home, buildTap("crew-other-", { ".": ["gamma"] }), "other");
    expect(runCli(["install", "acme"], { home, streams: quiet() })).toBe(0);
    expect(runCli(["install", "gamma"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["alpha", "beta", "gamma"]);

    const cap = captureStreams();
    expect(runCli(["uninstall", "acme"], { home, streams: cap.streams })).toBe(0);
    // Only the `acme` tap's skills went; the other tap's skill stays.
    expect(installed(home)).toEqual(["gamma"]);
    expect(cap.stdout()).toContain("Uninstalling tap acme");
  });

  test("C-UNINST-20 a namespace selector removes only that namespace", () => {
    const home = makeCrewHome();
    addTap(
      home,
      buildTap("crew-ns-", { marketing: ["email-outreach", "social-posts"], eng: ["testing"] }),
      "acme",
    );
    expect(runCli(["install", "acme"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["email-outreach", "social-posts", "testing"]);

    // Qualified form.
    expect(runCli(["uninstall", "acme/marketing"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["testing"]);
  });

  test("C-UNINST-20 a bare namespace unique across taps resolves", () => {
    const home = makeCrewHome();
    addTap(
      home,
      buildTap("crew-ns2-", { marketing: ["email-outreach"], eng: ["testing"] }),
      "acme",
    );
    expect(runCli(["install", "acme"], { home, streams: quiet() })).toBe(0);

    expect(runCli(["uninstall", "marketing"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["testing"]);
  });

  test("C-UNINST-21 an installed skill name wins over a same-named tap", () => {
    const home = makeCrewHome();
    // Tap `alpha` holds a skill also called `alpha`, plus a sibling.
    addTap(home, buildTap("crew-alpha-", { ".": ["alpha", "beta"] }), "alpha");
    expect(runCli(["install", "alpha"], { home, streams: quiet() })).toBe(0);
    expect(runCli(["install", "beta"], { home, streams: quiet() })).toBe(0);

    // `alpha` is an installed skill, so only it is removed — not the tap.
    expect(runCli(["uninstall", "alpha"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["beta"]);
  });

  test("C-UNINST-22 a name that is both a tap and a namespace is ambiguous", () => {
    const home = makeCrewHome();
    // Tap named `marketing`; a different tap has a `marketing` namespace.
    addTap(home, buildTap("crew-mk-", { ".": ["brand-voice"] }), "marketing");
    addTap(home, buildTap("crew-acme2-", { marketing: ["email-outreach"] }), "acme");
    // Install via unambiguous refs so the collision only arises on uninstall.
    expect(runCli(["install", "--tap", "marketing"], { home, streams: quiet() })).toBe(0);
    expect(runCli(["install", "acme/marketing/email-outreach"], { home, streams: quiet() })).toBe(
      0,
    );

    const cap = captureStreams();
    expect(runCli(["uninstall", "marketing"], { home, streams: cap.streams })).toBe(4);
    const err = cap.stderr();
    expect(err).toContain("crew uninstall marketing");
    expect(err).toContain("crew uninstall acme/marketing");
    // Nothing was removed.
    expect(installed(home)).toEqual(["brand-voice", "email-outreach"]);
  });

  test("C-UNINST-22 a bare namespace installed from two taps is ambiguous", () => {
    const home = makeCrewHome();
    // The same namespace name exists, with installed entries, in two taps.
    addTap(home, buildTap("crew-two-a-", { marketing: ["email-outreach"] }), "acme");
    addTap(home, buildTap("crew-two-b-", { marketing: ["brand-voice"] }), "other");
    expect(runCli(["install", "acme"], { home, streams: quiet() })).toBe(0);
    expect(runCli(["install", "other"], { home, streams: quiet() })).toBe(0);

    const cap = captureStreams();
    expect(runCli(["uninstall", "marketing"], { home, streams: cap.streams })).toBe(4);
    const err = cap.stderr();
    expect(err).toContain("crew uninstall acme/marketing");
    expect(err).toContain("crew uninstall other/marketing");
    expect(installed(home)).toEqual(["brand-voice", "email-outreach"]);
  });

  test("C-UNINST-23 a configured tap with nothing installed is reported, not an error", () => {
    const home = makeCrewHome();
    addTap(home, buildTap("crew-empty-", { ".": ["alpha"] }), "acme");

    const cap = captureStreams();
    expect(runCli(["uninstall", "acme"], { home, streams: cap.streams })).toBe(0);
    expect(cap.stdout()).toContain("Nothing installed from tap acme");
  });

  test("C-UNINST-19 collection removal composes with --agent", () => {
    const home = makeCrewHome();
    addTap(home, buildTap("crew-ag-", { ".": ["alpha", "beta"] }), "acme");
    expect(runCli(["install", "acme"], { home, streams: quiet() })).toBe(0);

    // claude-code is the only detected agent, so removing it empties both entries.
    expect(
      runCli(["uninstall", "--agent", "claude-code", "acme"], { home, streams: quiet() }),
    ).toBe(0);
    expect(installed(home)).toEqual([]);
  });
});

describe("--all", () => {
  test("C-UNINST-24 --all --yes removes every user-scope skill", () => {
    const home = makeCrewHome();
    addTap(home, buildTap("crew-all-", { ".": ["alpha", "beta"] }), "acme");
    expect(runCli(["install", "acme"], { home, streams: quiet() })).toBe(0);

    expect(runCli(["uninstall", "--all", "--yes"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual([]);
  });

  test("C-UNINST-24 --all prompts and proceeds on yes", () => {
    const home = makeCrewHome();
    addTap(home, buildTap("crew-all2-", { ".": ["alpha", "beta"] }), "acme");
    expect(runCli(["install", "acme"], { home, streams: quiet() })).toBe(0);

    const prompt = stubPrompt("yes");
    expect(runCli(["uninstall", "--all"], { home, streams: quiet(), prompt: prompt.fn })).toBe(0);
    expect(prompt.calls()).toBe(1);
    expect(installed(home)).toEqual([]);
  });

  test("C-UNINST-24 --all removes nothing when the user declines", () => {
    const home = makeCrewHome();
    addTap(home, buildTap("crew-all3-", { ".": ["alpha", "beta"] }), "acme");
    expect(runCli(["install", "acme"], { home, streams: quiet() })).toBe(0);

    const prompt = stubPrompt("no");
    const cap = captureStreams();
    expect(runCli(["uninstall", "--all"], { home, streams: cap.streams, prompt: prompt.fn })).toBe(
      4,
    );
    expect(cap.stderr()).toContain("Aborted");
    expect(installed(home)).toEqual(["alpha", "beta"]);
  });

  test("C-UNINST-24 --all without a TTY and without --yes is a usage error", () => {
    const home = makeCrewHome();
    addTap(home, buildTap("crew-all4-", { ".": ["alpha"] }), "acme");
    expect(runCli(["install", "acme"], { home, streams: quiet() })).toBe(0);

    const prompt = stubPrompt("abort");
    const cap = captureStreams();
    expect(runCli(["uninstall", "--all"], { home, streams: cap.streams, prompt: prompt.fn })).toBe(
      4,
    );
    expect(cap.stderr()).toContain("--yes");
    expect(installed(home)).toEqual(["alpha"]);
  });

  test("C-UNINST-24 --all with a skill name is a usage error", () => {
    const home = makeCrewHome();
    const cap = captureStreams();
    expect(runCli(["uninstall", "--all", "foo"], { home, streams: cap.streams })).toBe(4);
    expect(cap.stderr()).toContain("takes no skill names");
  });

  test("C-UNINST-24 --all with nothing installed reports not_installed_here", () => {
    const home = makeCrewHome();
    const cap = captureStreams();
    expect(runCli(["uninstall", "--all", "--yes"], { home, streams: cap.streams })).toBe(6);
    expect(cap.stderr()).toContain("nothing is installed");
  });

  test("C-UNINST-24 --all --scope project removes only this project's skills", () => {
    const home = makeCrewHome();
    const project = makeTempDir("crew-proj-");
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }));
    expect(runCli(["install", skill], { home, streams: quiet() })).toBe(0);
    expect(
      runCli(["install", "--scope", "project", skill], { home, cwd: project, streams: quiet() }),
    ).toBe(0);

    expect(
      runCli(["uninstall", "--all", "--yes", "--scope", "project"], {
        home,
        cwd: project,
        streams: quiet(),
      }),
    ).toBe(0);
    // The user-scope install survives.
    const entries = readState(home).installations;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.scope).toBe("user");
  });
});
