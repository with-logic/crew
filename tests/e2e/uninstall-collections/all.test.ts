/**
 * `crew uninstall --all` (§5.3.1).
 *
 * Covers C-UNINST-24: `--all` removes everything at the target scope
 * behind a confirmation, and refuses rather than guessing when it cannot
 * ask.
 */

import { describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import type { ConfirmOutcome } from "../../../src/cli/prompt.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { addTap, buildTap, install, installed, quiet, useClaudeCodeAdapter } from "./helpers.ts";

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

useClaudeCodeAdapter();

describe("--all", () => {
  test("C-UNINST-24 --all --yes removes every user-scope skill", () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-all-", { ".": ["alpha", "beta"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);

    expect(runCli(["uninstall", "--all", "--yes"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual([]);
  });

  test("C-UNINST-24 --all prompts and proceeds on yes", () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-all2-", { ".": ["alpha", "beta"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);

    const prompt = stubPrompt("yes");
    expect(runCli(["uninstall", "--all"], { home, streams: quiet(), prompt: prompt.fn })).toBe(0);
    expect(prompt.calls()).toBe(1);
    expect(installed(home)).toEqual([]);
  });

  test("C-UNINST-24 --all confirms before locking and re-reads state after", () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-all-live-", { ".": ["alpha", "beta"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);

    // Installing from inside the prompt proves two things at once: the
    // state lock is not held while we wait for a human (the install
    // would deadlock on it), and the removal acts on state as it is
    // after the answer, not the snapshot the count was taken from.
    let installedDuringPrompt = false;
    const prompt = (): ConfirmOutcome => {
      if (!installedDuringPrompt) {
        installedDuringPrompt = true;
        expect(install(home, [buildTap("crew-all-late-", { ".": ["gamma"] })])).toBe(0);
      }
      return "yes";
    };

    expect(runCli(["uninstall", "--all"], { home, streams: quiet(), prompt })).toBe(0);
    expect(installedDuringPrompt).toBe(true);
    // `gamma` arrived after the count and must still be swept.
    expect(installed(home)).toEqual([]);
  });

  test("C-UNINST-24 --all removes nothing when the user declines", () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-all3-", { ".": ["alpha", "beta"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);

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
    expect(addTap(home, buildTap("crew-all4-", { ".": ["alpha"] }), "acme")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);

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
    expect(install(home, [skill])).toBe(0);
    expect(install(home, ["--scope", "project", skill], project)).toBe(0);

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
