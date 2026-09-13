/**
 * C-INST-13c/13h: when attribution must NOT move.
 *
 * Re-attribution is bookkeeping crew owns, so it stops at two lines: a
 * registered tap is the user's own naming choice (§16.5), and a whole-tap
 * subscription is never traded for a narrower tap, which would end
 * sibling re-expansion once the broad tap is collected (§10.1.1).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig } from "../../../src/config/load.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { type AdapterRedirect, buildRepo, install, redirectClaudeCode } from "./helpers.ts";

let cc: AdapterRedirect;
let codexOriginal: { u: () => string; d: () => boolean };

beforeEach(() => {
  cc = redirectClaudeCode();
  // One test adds a second agent, which is the non-forced route into
  // `performInstall` for an already-installed skill.
  codexOriginal = { u: codexAdapter.userPath, d: codexAdapter.detect };
  const coRoot = makeTempDir("crew-codex-");
  (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
});
afterEach(() => {
  cc.restore();
  (codexAdapter as { userPath: () => string }).userPath = codexOriginal.u;
  (codexAdapter as { detect: () => boolean }).detect = codexOriginal.d;
});

describe("C-INST-13c attribution the move must not take", () => {
  test("C-INST-13c a registered narrow tap is not re-attributed", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);
    runCli(["tap", "add", `file://${repo}//skills/docx`, "mine"], {
      home,
      streams: captureStreams().streams,
    });
    expect(install(home, "mine/docx").code).toBe(0);
    expect(readState(home).installations.find((e) => e.name === "docx")!.source.tap).toBe("mine");

    const second = install(home, `file://${repo}`);
    expect(second.code).toBe(0);
    expect(second.out).not.toContain("now tracked via");

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    expect(entry.source.tap).toBe("mine");
    expect(readConfig(home).taps.some((t) => t.name === "mine")).toBe(true);
  });

  test("C-INST-13h a whole-tap subscription is not narrowed onto a subpath tap", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);

    // Whole-repo install subscribes the group to re-expansion.
    expect(install(home, `file://${repo}`).code).toBe(0);
    const docxBefore = readState(home).installations.find((e) => e.name === "docx")!;
    const broadTap = docxBefore.source.tap;
    expect(docxBefore.tracks_tap).toBe(true);

    // Installing the same location through a narrower tap must not move
    // the entry: the broad tap would then be GC'd and re-expansion would
    // stop seeing siblings (§10.1.1).
    expect(install(home, `file://${repo}//skills/docx`).code).toBe(0);

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    expect(entry.source.tap).toBe(broadTap);
    expect(entry.tracks_tap).toBe(true);
    expect(readConfig(home).taps.some((t) => t.name === broadTap)).toBe(true);
  });

  test("C-INST-13h --force does not narrow the subscription either", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);

    expect(install(home, `file://${repo}`).code).toBe(0);
    const broadTap = readState(home).installations.find((e) => e.name === "docx")!.source.tap;

    // `--force` re-installs rather than reporting "already installed",
    // so the skill reaches `performInstall`. The write path must honor
    // the same refusal the classification made: §13 lists what `--force`
    // overrides, and narrowing a whole-tap subscription is not on it.
    const cap = captureStreams();
    expect(
      runCli(["install", `file://${repo}//skills/docx`, "--force", "--agent", "claude-code"], {
        home,
        streams: cap.streams,
      }),
    ).toBe(0);

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    expect(entry.source.tap).toBe(broadTap);
    expect(entry.source.path).toBe("skills/docx");
    expect(entry.tracks_tap).toBe(true);
    expect(readConfig(home).taps.some((t) => t.name === broadTap)).toBe(true);
  });

  test("C-INST-13h adding an agent through a narrow tap keeps the broad source", () => {
    const home = makeCrewHome();
    const repo = buildRepo(["docx", "pdf"]);

    expect(install(home, `file://${repo}`).code).toBe(0);
    const broadTap = readState(home).installations.find((e) => e.name === "docx")!.source.tap;

    // A newly active adapter also routes the skill through
    // `performInstall` without `--force`, so it is the second way the
    // narrow tap could overwrite the broad attribution.
    const cap = captureStreams();
    const rc = runCli(
      ["install", `file://${repo}//skills/docx`, "--agent", "claude-code", "--agent", "codex"],
      { home, streams: cap.streams },
    );
    expect(rc).toBe(0);

    const entry = readState(home).installations.find((e) => e.name === "docx")!;
    expect(entry.source.tap).toBe(broadTap);
    expect(entry.tracks_tap).toBe(true);
  });
});
