/**
 * Namespaced skill resolution (PRD §8.3, §9 step 5).
 *
 * Covers:
 *   - C-NS-02: `crew install <namespace>` installs every skill
 *   - C-NS-03: `crew install <tap>/<namespace>/<skill>` is unambiguous
 *   - C-NS-04: `crew install <namespace>/<skill>` when `namespace`
 *     exists in exactly one tap
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { buildNamespacedTap } from "./helpers.ts";

let restore: () => void;
beforeEach(() => {
  const originals = {
    cc: { user: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect },
    co: { user: codexAdapter.userPath, detect: codexAdapter.detect },
    ge: { user: geminiCliAdapter.userPath, detect: geminiCliAdapter.detect },
  };
  const ccRoot = makeTempDir("ns-cc-");
  const coRoot = makeTempDir("ns-co-");
  const geRoot = makeTempDir("ns-ge-");
  (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
  (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  (codexAdapter as { userPath: () => string }).userPath = () => coRoot;
  (codexAdapter as { detect: () => boolean }).detect = () => true;
  (geminiCliAdapter as { userPath: () => string }).userPath = () => geRoot;
  (geminiCliAdapter as { detect: () => boolean }).detect = () => true;
  restore = () => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = originals.cc.user;
    (claudeCodeAdapter as { detect: () => boolean }).detect = originals.cc.detect;
    (codexAdapter as { userPath: () => string }).userPath = originals.co.user;
    (codexAdapter as { detect: () => boolean }).detect = originals.co.detect;
    (geminiCliAdapter as { userPath: () => string }).userPath = originals.ge.user;
    (geminiCliAdapter as { detect: () => boolean }).detect = originals.ge.detect;
  };
});
afterEach(() => restore());

describe("C-NS-02 install namespace by bare name", () => {
  test("installs every skill in the namespace", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildNamespacedTap("ns-bare-", {
      marketing: ["email-outreach", "social-posts"],
      engineering: ["code-review"],
    });
    runCli(["tap", "add", `file://${repo}`, "acme"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "marketing"], { home, streams: captureStreams().streams });
    expect(code).toBe(0);
    const state = readState(home);
    const names = state.installations.map((e) => e.name).sort();
    expect(names).toEqual(["email-outreach", "social-posts"]);
  });
});

describe("C-NS-03 3-segment install", () => {
  test("tap/ns/skill picks exactly that skill", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildNamespacedTap("ns-3seg-", {
      marketing: ["email-outreach", "social-posts"],
    });
    runCli(["tap", "add", `file://${repo}`, "acme"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "acme/marketing/email-outreach"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations.length).toBe(1);
    expect(state.installations[0]!.name).toBe("email-outreach");
  });

  test("tap/ns/skill is case-insensitive", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildNamespacedTap("ns-3seg-case-", {
      marketing: ["email-outreach"],
    });
    runCli(["tap", "add", `file://${repo}`, "acme"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "Acme/Marketing/Email-Outreach"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    expect(readState(home).installations[0]!.name).toBe("email-outreach");
  });
});

describe("C-NS-04 2-segment ns/skill", () => {
  test("resolves when the namespace exists in exactly one tap", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildNamespacedTap("ns-2seg-", {
      marketing: ["email-outreach"],
    });
    runCli(["tap", "add", `file://${repo}`, "acme"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "marketing/email-outreach"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.name).toBe("email-outreach");
  });
});
