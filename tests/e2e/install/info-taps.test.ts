/**
 * `crew info` walking taps and its error paths (§10.5).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { geminiCliAdapter } from "../../../src/agents/gemini-cli.ts";
import { runCli } from "../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

type Redirectable = {
  userPath: () => string;
  projectPath: (cwd: string) => string;
  detect: () => boolean;
};
/** Every target adapter with the `<cwd>/<dir>/skills` project layout it uses. */
const ADAPTERS: ReadonlyArray<readonly [name: string, adapter: Redirectable, dir: string]> = [
  ["claude-code", claudeCodeAdapter, ".claude"],
  ["codex", codexAdapter, ".codex"],
  ["gemini-cli", geminiCliAdapter, ".gemini"],
];

/**
 * Redirect every target adapter to a tmp directory so tests never touch
 * `~/.claude/skills` etc. Returns the tmp roots keyed by adapter name and
 * a restore function.
 */
function redirectAdapters(): { agents: Record<string, string>; restore: () => void } {
  const agents: Record<string, string> = {};
  const saved = ADAPTERS.map(
    ([, adapter]) =>
      [
        adapter,
        { userPath: adapter.userPath, projectPath: adapter.projectPath, detect: adapter.detect },
      ] as const,
  );
  for (const [name, adapter, dir] of ADAPTERS) {
    const root = makeTempDir(`crew-${name}-`);
    agents[name] = root;
    adapter.userPath = () => root;
    adapter.projectPath = (cwd) => join(cwd, dir, "skills");
    adapter.detect = () => true;
  }
  return {
    agents,
    restore() {
      for (const [adapter, original] of saved) Object.assign(adapter, original);
    },
  };
}

let redirect: ReturnType<typeof redirectAdapters>;

beforeEach(() => {
  redirect = redirectAdapters();
});
afterEach(() => {
  redirect.restore();
});

describe("list, info, targets", () => {
  test("info on an installed skill whose SKILL.md got tampered with still renders", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "demo", skillFrontmatter({ name: "demo", description: "original" }));
    runCli(["install", src], { home, streams: captureStreams().streams });
    // Break the installed SKILL.md so loadSkill throws. The command
    // should still render — just without a description.
    const fs = require("node:fs") as typeof import("node:fs");
    const ccDemo = join(redirect.agents["claude-code"]!, "demo", "SKILL.md");
    fs.writeFileSync(ccDemo, "not valid frontmatter");
    // Also break the codex and gemini copies so all three fail and we
    // exercise the fall-through.
    fs.writeFileSync(join(redirect.agents["codex"]!, "demo", "SKILL.md"), "garbage");
    fs.writeFileSync(join(redirect.agents["gemini-cli"]!, "demo", "SKILL.md"), "garbage");
    const c = captureStreams();
    const code = runCli(["info", "demo"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("demo");
  });

  test("info on a multi-skill tap lists each skill under a header", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "alpha", skillFrontmatter({ name: "alpha", license: "MIT" }));
    makeSkill(
      src,
      "beta",
      skillFrontmatter({ name: "beta", dependencies: ["alpha"], homepage: "https://x.dev" }),
    );
    runCli(["tap", "add", src, "multi"], { home, streams: captureStreams().streams });
    const c = captureStreams();
    const code = runCli(["info", "multi"], { home, streams: c.streams });
    expect(code).toBe(0);
    expect(c.stdout()).toContain("2 skills in multi");
    expect(c.stdout()).toContain("alpha");
    expect(c.stdout()).toContain("beta");
    expect(c.stdout()).toContain("license");
    expect(c.stdout()).toContain("depends on");
    expect(c.stdout()).toContain("homepage");
    expect(c.stdout()).toContain("install them all");
  });

  test("info `<tap>/<skill>` walks the named tap", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "widget", skillFrontmatter({ name: "widget", description: "a widget" }));
    // Add a path tap explicitly.
    runCli(["tap", "add", src, "localtap"], { home, streams: captureStreams().streams });
    const capture = captureStreams();
    const code = runCli(["info", "localtap/widget"], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).toContain("widget");
  });

  test("info `<unknown-tap>/<skill>` is invalid_ref", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    const code = runCli(["info", "nope/widget"], { home, streams: capture.streams });
    expect(code).toBe(4);
    expect(capture.stderr()).toContain("nope");
  });

  test("info on a bare name that matches a tap (not a state entry)", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "inside", skillFrontmatter({ name: "inside" }));
    runCli(["tap", "add", src, "mytap"], { home, streams: captureStreams().streams });
    const capture = captureStreams();
    const code = runCli(["info", "mytap"], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).toContain("inside");
  });

  test("info with no args is a usage error", () => {
    const home = makeCrewHome();
    const capture = captureStreams();
    const code = runCli(["info"], { home, streams: capture.streams });
    expect(code).toBe(4);
    expect(capture.stderr()).toContain("one skill name or reference");
  });

  test("info on a bare skill name via cross-tap search (not installed)", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "lonely", skillFrontmatter({ name: "lonely", description: "solo skill" }));
    runCli(["tap", "add", src, "solo"], { home, streams: captureStreams().streams });
    const capture = captureStreams();
    const code = runCli(["info", "lonely"], { home, streams: capture.streams });
    expect(code).toBe(0);
    expect(capture.stdout()).toContain("lonely");
  });
});
