/**
 * Global test preload.
 *
 * 1. Neutralize every agent adapter except the three that existing
 *    tests explicitly control (`claude-code`, `codex`, `gemini-cli`).
 *    This keeps tests deterministic on a dev machine that happens to
 *    have `~/.cursor/`, `~/.factory/`, etc. from real product
 *    installs.
 *
 * 2. Force `claude-code` to always detect, so tests that don't
 *    explicitly `redirectAdapters` still have at least one active
 *    agent — otherwise fresh CI runners (no Claude Code installed)
 *    would fail every install with `no_agents`.
 *
 * Tests that need a different subset should override specific
 * adapters in their own `beforeEach`, or call
 * `neutralizeAdaptersExcept` directly with their preferred set.
 */

import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { neutralizeAdaptersExcept } from "./env.ts";

neutralizeAdaptersExcept(["claude-code", "codex", "gemini-cli"]);

(claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
