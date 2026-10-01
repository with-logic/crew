/**
 * `crew uninstall` collection-selector resolution (§7.4).
 *
 * Covers C-UNINST-20..23: which installed entries a tap or namespace name
 * resolves to, that an installed skill name wins over both, and that a
 * genuinely ambiguous word is reported rather than guessed.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { addTap, buildTap, install, installed, quiet } from "./helpers.ts";

let originals: { user: () => string; project: (c: string) => string; detect: () => boolean };
beforeEach(() => {
  const root = makeTempDir("crew-cc-");
  originals = {
    user: claudeCodeAdapter.userPath,
    project: claudeCodeAdapter.projectPath,
    detect: claudeCodeAdapter.detect,
  };
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => root;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = (c) =>
    join(c, ".claude", "skills");
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  (claudeCodeAdapter as { userPath: () => string }).userPath = originals.user;
  (claudeCodeAdapter as { projectPath: (c: string) => string }).projectPath = originals.project;
  (claudeCodeAdapter as { detect: () => boolean }).detect = originals.detect;
});

describe("collection selector resolution", () => {
  test("C-UNINST-20 a tap name removes every skill installed from that tap", () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-acme-", { ".": ["alpha", "beta"] }), "acme")).toBe(0);
    expect(addTap(home, buildTap("crew-other-", { ".": ["gamma"] }), "other")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);
    expect(install(home, ["gamma"])).toBe(0);
    expect(installed(home)).toEqual(["alpha", "beta", "gamma"]);

    const cap = captureStreams();
    expect(runCli(["uninstall", "acme"], { home, streams: cap.streams })).toBe(0);
    // Only the `acme` tap's skills went; the other tap's skill stays.
    expect(installed(home)).toEqual(["gamma"]);
    expect(cap.stdout()).toContain("Uninstalling tap acme");
  });

  test("C-UNINST-21 a namespace selector removes only that namespace", () => {
    const home = makeCrewHome();
    expect(
      addTap(
        home,
        buildTap("crew-ns-", { marketing: ["email-outreach", "social-posts"], eng: ["testing"] }),
        "acme",
      ),
    ).toBe(0);
    expect(install(home, ["acme"])).toBe(0);
    expect(installed(home)).toEqual(["email-outreach", "social-posts", "testing"]);

    // Qualified form.
    expect(runCli(["uninstall", "acme/marketing"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["testing"]);
  });

  test("C-UNINST-21 a bare namespace unique across taps resolves", () => {
    const home = makeCrewHome();
    expect(
      addTap(
        home,
        buildTap("crew-ns2-", { marketing: ["email-outreach"], eng: ["testing"] }),
        "acme",
      ),
    ).toBe(0);
    expect(install(home, ["acme"])).toBe(0);

    expect(runCli(["uninstall", "marketing"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["testing"]);
  });

  test("C-UNINST-22 an installed skill name wins over a same-named tap", () => {
    const home = makeCrewHome();
    // Tap `alpha` holds a skill also called `alpha`, plus a sibling.
    expect(addTap(home, buildTap("crew-alpha-", { ".": ["alpha", "beta"] }), "alpha")).toBe(0);
    expect(install(home, ["alpha"])).toBe(0);
    expect(install(home, ["beta"])).toBe(0);

    // `alpha` is an installed skill, so only it is removed — not the tap.
    expect(runCli(["uninstall", "alpha"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["beta"]);
  });

  test("C-UNINST-22 an installed skill name wins over a same-named namespace", () => {
    const home = makeCrewHome();
    // Tap `acme` has a `marketing` namespace; a second tap ships a
    // top-level skill that is also called `marketing`. Skill-first
    // resolution (§7.4) must pick the skill, not the namespace.
    expect(addTap(home, buildTap("crew-nsa-", { marketing: ["guides"] }), "acme")).toBe(0);
    expect(addTap(home, buildTap("crew-nsb-", { ".": ["marketing"] }), "other")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);
    expect(install(home, ["other"])).toBe(0);
    expect(installed(home)).toEqual(["guides", "marketing"]);

    expect(runCli(["uninstall", "marketing"], { home, streams: quiet() })).toBe(0);
    expect(installed(home)).toEqual(["guides"]);
  });

  test("C-UNINST-23 a name that is both a tap and a namespace is ambiguous", () => {
    const home = makeCrewHome();
    // Tap named `marketing`; a different tap has a `marketing` namespace.
    expect(addTap(home, buildTap("crew-mk-", { ".": ["brand-voice"] }), "marketing")).toBe(0);
    expect(addTap(home, buildTap("crew-acme2-", { marketing: ["email-outreach"] }), "acme")).toBe(
      0,
    );
    // Install via unambiguous refs so the collision only arises on uninstall.
    expect(install(home, ["--tap", "marketing"])).toBe(0);
    expect(install(home, ["acme/marketing/email-outreach"])).toBe(0);

    const cap = captureStreams();
    expect(runCli(["uninstall", "marketing"], { home, streams: cap.streams })).toBe(4);
    const err = cap.stderr();
    expect(err).toContain("crew uninstall marketing");
    expect(err).toContain("crew uninstall acme/marketing");
    // Nothing was removed.
    expect(installed(home)).toEqual(["brand-voice", "email-outreach"]);
  });

  test("C-UNINST-23 a bare namespace installed from two taps is ambiguous", () => {
    const home = makeCrewHome();
    // The same namespace name exists, with installed entries, in two taps.
    expect(addTap(home, buildTap("crew-two-a-", { marketing: ["email-outreach"] }), "acme")).toBe(
      0,
    );
    expect(addTap(home, buildTap("crew-two-b-", { marketing: ["brand-voice"] }), "other")).toBe(0);
    expect(install(home, ["acme"])).toBe(0);
    expect(install(home, ["other"])).toBe(0);

    const cap = captureStreams();
    expect(runCli(["uninstall", "marketing"], { home, streams: cap.streams })).toBe(4);
    const err = cap.stderr();
    expect(err).toContain("crew uninstall acme/marketing");
    expect(err).toContain("crew uninstall other/marketing");
    expect(installed(home)).toEqual(["brand-voice", "email-outreach"]);
  });

  test("C-UNINST-24 a configured tap with nothing installed is reported, not an error", () => {
    const home = makeCrewHome();
    expect(addTap(home, buildTap("crew-empty-", { ".": ["alpha"] }), "acme")).toBe(0);

    const cap = captureStreams();
    expect(runCli(["uninstall", "acme"], { home, streams: cap.streams })).toBe(0);
    expect(cap.stdout()).toContain("Nothing installed from tap acme");
  });
});
