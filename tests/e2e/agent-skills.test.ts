/**
 * End-to-end: the `agent-skills` adapter (§7.2, C-AGENT-07/08).
 *
 * When a spec-compliant agent is the only thing installed, `~/.agents/`
 * exists → `agent-skills` detects → `crew install` writes under
 * `~/.agents/skills/` and the install summary names `agent-skills`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { agentSkillsAdapter } from "../../src/agents/agent-skills.ts";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome, withOriginalAdapter } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

type Mut = { userPath: () => string; detect: () => boolean };
let agentSkillsRoot: string;
let savedAgentSkills: { userPath: () => string; detect: () => boolean };
let savedClaudeCodeDetect: () => boolean;

beforeEach(() => {
  // Redirect agent-skills to a tmp dir and force detect=true so we
  // don't depend on a real ~/.agents/ on the dev machine. Turn
  // claude-code off so agent-skills is the sole active adapter — the
  // simplest way to assert "bytes landed under agent-skills."
  savedAgentSkills = { userPath: agentSkillsAdapter.userPath, detect: agentSkillsAdapter.detect };
  agentSkillsRoot = makeTempDir("crew-agent-skills-");
  (agentSkillsAdapter as Mut).userPath = () => agentSkillsRoot;
  (agentSkillsAdapter as Mut).detect = () => true;
  savedClaudeCodeDetect = claudeCodeAdapter.detect;
  (claudeCodeAdapter as Mut).detect = () => false;
});

afterEach(() => {
  (agentSkillsAdapter as Mut).userPath = savedAgentSkills.userPath;
  (agentSkillsAdapter as Mut).detect = savedAgentSkills.detect;
  (claudeCodeAdapter as Mut).detect = savedClaudeCodeDetect;
});

describe("agent-skills adapter (§7.2)", () => {
  test("C-AGENT-08 install writes to ~/.agents/skills and summary names agent-skills", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }), "body");

    const c = captureStreams();
    const code = runCli(["install", skill], { home, streams: c.streams });
    expect(code).toBe(0);

    const dest = join(agentSkillsRoot, "demo");
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, ".crew.json"))).toBe(true);

    const state = readState(home);
    expect(state.installations).toHaveLength(1);
    expect([...state.installations[0]!.agents]).toEqual(["agent-skills"]);
    expect(c.stdout()).toContain("agent-skills");
  });

  test("C-AGENT-07 detects iff ~/.agents exists", () => {
    const prevHome = process.env["HOME"];
    const scratch = makeTempDir("crew-as-home-");
    process.env["HOME"] = scratch;
    try {
      withOriginalAdapter("agent-skills", (a) => {
        expect(a.detect()).toBe(false);
        mkdirSync(join(scratch, ".agents"), { recursive: true });
        expect(a.detect()).toBe(true);
      });
    } finally {
      if (prevHome === undefined) delete process.env["HOME"];
      else process.env["HOME"] = prevHome;
    }
  });
});
