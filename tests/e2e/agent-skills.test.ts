/**
 * End-to-end: the `agent-skills` fallback adapter (§7.2, C-AGENT-07/08).
 *
 * When every tool-specific adapter returns false from `detect()`, the
 * fallback kicks in and `crew install` writes to `~/.agents/skills/`
 * under it. The install summary names `agent-skills` explicitly.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentAdapter } from "../../src/agents/adapter.ts";
import { agentSkillsAdapter } from "../../src/agents/agent-skills.ts";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { AGENT_SKILLS_NAME } from "../../src/agents/fallback.ts";
import { ALL_AGENTS } from "../../src/agents/registry.ts";
import { runCli } from "../../src/cli/main.ts";
import { readState } from "../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

type Mut = { userPath: () => string; detect: () => boolean };
const saved = new Map<string, { userPath: () => string; detect: () => boolean }>();
let agentSkillsRoot: string;

beforeEach(() => {
  // Flip every non-fallback adapter's detect to false so agent-skills
  // is the only active adapter via its §7.2 fallback semantics.
  for (const a of ALL_AGENTS) {
    if (a.name === AGENT_SKILLS_NAME) continue;
    saved.set(a.name, { userPath: a.userPath, detect: a.detect });
    (a as Mut).detect = () => false;
  }
  // Redirect the fallback's userPath to a tmp dir so the test never
  // writes into the real ~/.agents/skills.
  saved.set(AGENT_SKILLS_NAME, {
    userPath: agentSkillsAdapter.userPath,
    detect: agentSkillsAdapter.detect,
  });
  agentSkillsRoot = makeTempDir("crew-agent-skills-");
  (agentSkillsAdapter as Mut).userPath = () => agentSkillsRoot;
});

afterEach(() => {
  for (const a of ALL_AGENTS) {
    const orig = saved.get(a.name);
    if (orig === undefined) continue;
    (a as AgentAdapter as Mut).userPath = orig.userPath;
    (a as AgentAdapter as Mut).detect = orig.detect;
  }
  saved.clear();
});

describe("agent-skills fallback adapter (§7.2)", () => {
  test("C-AGENT-08 install writes to ~/.agents/skills when only fallback is active", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }), "body");

    const capture = captureStreams();
    const code = runCli(["install", skill], { home, streams: capture.streams });
    expect(code).toBe(0);

    const dest = join(agentSkillsRoot, "demo");
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, ".crew.json"))).toBe(true);

    const state = readState(home);
    expect(state.installations).toHaveLength(1);
    expect([...state.installations[0]!.agents]).toEqual([AGENT_SKILLS_NAME]);
  });

  test("C-AGENT-08 install summary names agent-skills", () => {
    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }), "body");

    const capture = captureStreams();
    runCli(["install", skill], { home, streams: capture.streams });
    expect(capture.stdout()).toContain(AGENT_SKILLS_NAME);
  });

  test("fallback stays off when another adapter is restored to detecting", () => {
    // Restore claude-code's preload-forced detect=true, and undo the
    // per-test silencing. The claude-code preload points at an inert
    // path, so this install would fail to write anywhere real — we
    // only assert that install *doesn't* land under agent-skills.
    (claudeCodeAdapter as Mut).detect = () => true;

    const home = makeCrewHome();
    const src = makeTempDir("crew-src-");
    const skill = makeSkill(src, "demo", skillFrontmatter({ name: "demo" }), "body");

    const capture = captureStreams();
    runCli(["install", skill], { home, streams: capture.streams });

    expect(existsSync(join(agentSkillsRoot, "demo"))).toBe(false);
    const state = readState(home);
    if (state.installations.length > 0) {
      expect([...state.installations[0]!.agents]).not.toContain(AGENT_SKILLS_NAME);
    }
  });
});
