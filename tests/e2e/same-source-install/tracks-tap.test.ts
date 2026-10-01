/**
 * C-INST-13l: re-attribution carries whole-tap tracking.
 *
 * Installing through a narrow tap and then through a tap covering the
 * same location moves the entry's attribution (§5.4). The subscription
 * has to move with it: `tracks_tap` is what §10.1.1 consults to decide
 * whether a later `crew update` picks up siblings added upstream. A
 * re-attributed entry never reaches `performInstall` — the only other
 * place `tracks_tap` is written — so without an explicit promotion an
 * entry that changed hands would stay subscribed to nothing, silently,
 * on a tap the user asked for whole.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { type AdapterRedirect, buildRepo, install, redirectClaudeCode } from "./helpers.ts";

let cc: AdapterRedirect;

beforeEach(() => {
  cc = redirectClaudeCode();
});
afterEach(() => {
  cc.restore();
});

/** Install a single skill by its `<tap>/<skill>` name. */
function installByName(home: string, ref: string): { code: number; out: string } {
  const cap = captureStreams();
  const code = runCli(["install", ref, "--agent", "claude-code"], { home, streams: cap.streams });
  return { code, out: cap.stdout() };
}

/** Uninstall, so a later by-name install is a fresh single-skill one. */
function uninstall(home: string, name: string): number {
  const cap = captureStreams();
  return runCli(["uninstall", name, "--yes"], { home, streams: cap.streams });
}

describe("re-attribution and whole-tap tracking", () => {
  test("C-INST-13l a reattributed entry gains the broad tap's subscription", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["solo", "keep"]);

    // Install the `skills/` subpath, creating a narrow auto tap. `keep`
    // stays installed so that tap survives garbage collection.
    expect(install(home, `file://${repo}//skills`).code).toBe(0);
    const narrowTap = readState(home).installations[0]!.source.tap;
    expect(uninstall(home, "solo")).toBe(0);

    // Re-install just `solo` by name through that auto tap. A
    // single-skill tap ref is not a whole-tap install, so no
    // subscription is recorded.
    expect(installByName(home, `${narrowTap}/solo`).code).toBe(0);
    const narrow = readState(home).installations.find((e) => e.name === "solo");
    expect(narrow?.source.tap).toBe(narrowTap);
    expect(narrow?.tracks_tap ?? false).toBe(false);

    // Now install the whole repo. Same canonical location reached through
    // a broader tap, so `solo` re-attributes — and the user has now asked
    // for the tap, so the subscription must move with the attribution.
    const second = install(home, `file://${repo}`);
    expect(second.code).toBe(0);
    expect(second.out).toContain("now tracked via");

    const after = readState(home).installations.find((e) => e.name === "solo");
    expect(after?.source.tap).not.toBe(narrowTap);
    expect(after?.tracks_tap).toBe(true);
  });

  test("C-INST-13l a narrow install after a broad one does not clear tracking", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["alpha", "beta"]);

    expect(install(home, `file://${repo}`).code).toBe(0);
    const broad = readState(home).installations.find((e) => e.name === "alpha");
    expect(broad?.tracks_tap).toBe(true);

    // Re-installing one child must not demote the subscription: once the
    // user asked for the whole tap, `tracks_tap` is one-way (§11.1).
    expect(install(home, `file://${repo}//skills/alpha`).code).toBe(0);

    const after = readState(home).installations.find((e) => e.name === "alpha");
    expect(after?.tracks_tap).toBe(true);
  });
});
