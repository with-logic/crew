/**
 * E2E tests for namespaced skills (PRD §8.3, §9 step 5, C-NS-*).
 *
 * Covers:
 *   - C-NS-02: `crew install <namespace>` installs every skill
 *   - C-NS-03: `crew install <tap>/<namespace>/<skill>` is unambiguous
 *   - C-NS-04: `crew install <namespace>/<skill>` when `namespace`
 *     exists in exactly one tap
 *   - C-NS-05: interactive prompt on ambiguity
 *   - C-NS-06/07/08: --tap / --bundle / --skill flags
 *   - C-NS-09: ambiguous_reference error names every candidate
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { codexAdapter } from "../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../src/agents/gemini-cli.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../helpers/fixtures.ts";

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

/** Build a tap repo with a namespaced layout. */
function buildNamespacedTap(prefix: string, layout: Record<string, readonly string[]>): string {
  const repo = makeTempDir(prefix);
  makeGitRepo(repo);
  const skillsDir = join(repo, "skills");
  mkdirSync(skillsDir);
  for (const [ns, skills] of Object.entries(layout)) {
    const nsDir = join(skillsDir, ns);
    mkdirSync(nsDir);
    for (const name of skills) {
      makeSkill(nsDir, name, skillFrontmatter({ name }));
    }
  }
  commitAll(repo, "initial");
  return repo;
}

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
