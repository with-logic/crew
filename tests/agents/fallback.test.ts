/**
 * Unit tests for the `agent-skills` fallback-detection helper (§7.2).
 * Covers both branches of `isFallbackDetected` — returns `true` when no
 * other adapter detects, `false` when at least one does.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { AGENT_SKILLS_NAME, isFallbackDetected } from "../../src/agents/fallback.ts";
import { ALL_AGENTS } from "../../src/agents/registry.ts";

// The preload neutralizes every adapter except claude-code/codex/
// gemini-cli, and force-detects claude-code. To exercise the
// "fallback-active" branch we have to flip ALL non-fallback adapters
// to detect=false (codex and gemini-cli have their real `detect()`
// preserved, which may return true on a dev machine with
// `~/.codex/` or `~/.gemini/` lying around).
type Mut = { detect: () => boolean };
const saved = new Map<string, () => boolean>();

function silenceAll(): void {
  for (const a of ALL_AGENTS) {
    if (a.name === AGENT_SKILLS_NAME) continue;
    saved.set(a.name, a.detect);
    (a as Mut).detect = () => false;
  }
}

beforeEach(() => {
  saved.clear();
});

afterEach(() => {
  for (const a of ALL_AGENTS) {
    const orig = saved.get(a.name);
    if (orig !== undefined) (a as Mut).detect = orig;
  }
});

describe("isFallbackDetected (§7.2)", () => {
  test("returns true when no other adapter detects", () => {
    silenceAll();
    expect(isFallbackDetected(ALL_AGENTS)).toBe(true);
  });

  test("returns false when at least one other adapter detects", () => {
    // Preload keeps claude-code force-detected; nothing else to do.
    expect(isFallbackDetected(ALL_AGENTS)).toBe(false);
  });

  test("skips the fallback adapter itself (no self-reference)", () => {
    silenceAll();
    // Would recurse infinitely if the helper called agent-skills'
    // detect. Finishing = proof it doesn't.
    expect(isFallbackDetected(ALL_AGENTS)).toBe(true);
  });

  test("exported name constant matches the adapter's name", () => {
    expect(AGENT_SKILLS_NAME).toBe("agent-skills");
    expect(ALL_AGENTS.some((a) => a.name === AGENT_SKILLS_NAME)).toBe(true);
  });
});
