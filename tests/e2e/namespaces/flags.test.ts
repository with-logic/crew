/**
 * Namespace disambiguation flags (PRD §8.3, C-NS-06/07/08): --tap,
 * --bundle, and --skill force one interpretation of a bare name.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
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

describe("C-NS-06 --tap flag", () => {
  test("forces tap-install interpretation", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildNamespacedTap("ns-tap-flag-", {
      marketing: ["email-outreach"],
    });
    runCli(["tap", "add", `file://${repo}`, "acme"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "--tap", "acme"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations.length).toBe(1);
    expect(state.installations[0]!.name).toBe("email-outreach");
  });
});

describe("C-NS-07 --bundle flag", () => {
  test("forces namespace-install interpretation", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const repo = buildNamespacedTap("ns-bundle-flag-", {
      marketing: ["email-outreach", "social-posts"],
    });
    runCli(["tap", "add", `file://${repo}`, "acme"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "--bundle", "marketing"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations.length).toBe(2);
  });
});

describe("C-NS-08 --skill flag", () => {
  test("forces single-skill interpretation", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // A namespace AND a standalone skill share the same name — the
    // namespace `pdf` with `extract`, and a skill `pdf` elsewhere.
    const a = makeTempDir("ns-skill-flag-a-");
    makeGitRepo(a);
    makeSkill(a, "pdf", skillFrontmatter({ name: "pdf" }));
    commitAll(a, "init");
    runCli(["tap", "add", `file://${a}`, "flat"], {
      home,
      streams: captureStreams().streams,
    });
    const b = buildNamespacedTap("ns-skill-flag-b-", { pdf: ["extract"] });
    runCli(["tap", "add", `file://${b}`, "docs"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "--skill", "pdf"], {
      home,
      streams: captureStreams().streams,
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.name).toBe("pdf");
  });

  test("mutually exclusive: --tap and --bundle together errors", () => {
    const home = makeCrewHome();
    const cap = captureStreams();
    const code = runCli(["install", "--tap", "--bundle", "x"], {
      home,
      streams: cap.streams,
    });
    expect(code).toBe(4);
    expect(cap.stderr()).toContain("mutually exclusive");
  });
});
