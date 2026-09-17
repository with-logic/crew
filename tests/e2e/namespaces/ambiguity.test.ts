/**
 * Ambiguous namespace references (PRD §8.3, C-NS-05/09): the interactive
 * prompt, the non-TTY abort naming every candidate, and the tap-wins
 * short-circuit when a tap and a namespace share a name.
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

describe("C-NS-05 + C-NS-09 ambiguity", () => {
  test("bare name that is both skill and namespace: aborts on non-TTY", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // tap A: a skill named `pdf` at root
    const a = makeTempDir("ns-amb-a-");
    makeGitRepo(a);
    makeSkill(a, "pdf", skillFrontmatter({ name: "pdf" }));
    commitAll(a, "init");
    runCli(["tap", "add", `file://${a}`, "flat"], {
      home,
      streams: captureStreams().streams,
    });
    // tap B: namespace `pdf` with skill `extract`
    const b = buildNamespacedTap("ns-amb-b-", { pdf: ["extract"] });
    runCli(["tap", "add", `file://${b}`, "docs"], {
      home,
      streams: captureStreams().streams,
    });

    const cap = captureStreams();
    const code = runCli(["install", "pdf"], {
      home,
      streams: cap.streams,
      promptChoice: () => "abort",
    });
    expect(code).toBe(4);
    expect(cap.stderr()).toContain("ambiguous");
    expect(cap.stderr()).toContain("crew install");
  });

  test("interactive prompt can pick a candidate", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    const a = makeTempDir("ns-amb2-a-");
    makeGitRepo(a);
    makeSkill(a, "pdf", skillFrontmatter({ name: "pdf" }));
    commitAll(a, "init");
    runCli(["tap", "add", `file://${a}`, "flat"], {
      home,
      streams: captureStreams().streams,
    });
    const b = buildNamespacedTap("ns-amb2-b-", { pdf: ["extract"] });
    runCli(["tap", "add", `file://${b}`, "docs"], {
      home,
      streams: captureStreams().streams,
    });

    // Pick choice index 0 = the first listed candidate (skill `pdf`).
    const code = runCli(["install", "pdf"], {
      home,
      streams: captureStreams().streams,
      promptChoice: () => ({ kind: "choice", index: 0 }),
    });
    expect(code).toBe(0);
    const state = readState(home);
    expect(state.installations[0]!.name).toBe("pdf");
  });
});

describe("same-named tap + namespace: tap wins (legacy behavior)", () => {
  test("`crew install pdf` installs the pdf tap, not the pdf namespace inside it", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // `pdf` tap contains a namespace `pdf` (weird but possible).
    const repo = buildNamespacedTap("ns-same-", { pdf: ["extract"] });
    runCli(["tap", "add", `file://${repo}`, "pdf"], {
      home,
      streams: captureStreams().streams,
    });
    const code = runCli(["install", "pdf"], {
      home,
      streams: captureStreams().streams,
    });
    // Exits 0 because the tap-install short-circuit wins.
    expect(code).toBe(0);
  });

  test("tap + namespace in another tap: prompt still fires", () => {
    const home = makeCrewHome();
    runCli(["tap", "remove", "core", "--force"], { home, streams: captureStreams().streams });
    // `pdf` tap (contents don't matter) — a skill so the tap has SOMETHING
    const a = makeTempDir("ns-xtap-");
    makeGitRepo(a);
    makeSkill(a, "anything", skillFrontmatter({ name: "anything" }));
    commitAll(a, "init");
    runCli(["tap", "add", `file://${a}`, "pdf"], {
      home,
      streams: captureStreams().streams,
    });
    // OTHER tap with a `pdf` namespace
    const b = buildNamespacedTap("ns-xtap-b-", { pdf: ["extract"] });
    runCli(["tap", "add", `file://${b}`, "docs"], {
      home,
      streams: captureStreams().streams,
    });
    // `pdf` is ambiguous: a tap, AND a namespace in the `docs` tap.
    // filterForAmbiguity keeps both (namespace is in a different tap).
    // Non-TTY → abort path throws ambiguous_reference.
    const cap = captureStreams();
    const code = runCli(["install", "pdf"], {
      home,
      streams: cap.streams,
      promptChoice: () => "abort",
    });
    expect(code).toBe(4);
    expect(cap.stderr()).toContain("ambiguous");
  });
});
