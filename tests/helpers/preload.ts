/**
 * Global test preload: neutralize every target adapter except the
 * three that existing tests explicitly control (`claude-code`,
 * `codex`, `gemini-cli`). This keeps tests deterministic on a dev
 * machine that happens to have `~/.cursor/`, `~/.factory/`, etc. from
 * real product installs.
 *
 * Tests that need a different subset should override specific
 * adapters in their own `beforeEach`, or call
 * `neutralizeAdaptersExcept` directly with their preferred set.
 */

import { neutralizeAdaptersExcept } from "./env.ts";

neutralizeAdaptersExcept(["claude-code", "codex", "gemini-cli"]);
