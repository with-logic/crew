/**
 * Adapter registry.
 *
 * Every adapter crew supports (§7.2) is registered here. Order is
 * alphabetical so `crew agents` output is deterministic. Multiple
 * adapters may resolve to the same install path (path sharing, §7.2);
 * the install engine dedupes writes but still reports each adapter
 * name to the user.
 */

import type { AgentAdapter } from "./adapter.ts";
import { ampAdapter } from "./amp.ts";
import { autohandAdapter } from "./autohand.ts";
import { claudeCodeAdapter } from "./claude-code.ts";
import { codexAdapter } from "./codex.ts";
import { commandCodeAdapter } from "./command-code.ts";
import { cursorAdapter } from "./cursor.ts";
import { factoryAdapter } from "./factory.ts";
import { geminiCliAdapter } from "./gemini-cli.ts";
import { githubCopilotAdapter } from "./github-copilot.ts";
import { gooseAdapter } from "./goose.ts";
import { junieAdapter } from "./junie.ts";
import { kiroAdapter } from "./kiro.ts";
import { mistralVibeAdapter } from "./mistral-vibe.ts";
import { nanobotAdapter } from "./nanobot.ts";
import { opencodeAdapter } from "./opencode.ts";
import { piAdapter } from "./pi.ts";
import { rooCodeAdapter } from "./roo-code.ts";

/** Every adapter crew ships, alphabetical by name. */
export const ALL_AGENTS: readonly AgentAdapter[] = [
  ampAdapter,
  autohandAdapter,
  claudeCodeAdapter,
  codexAdapter,
  commandCodeAdapter,
  cursorAdapter,
  factoryAdapter,
  geminiCliAdapter,
  githubCopilotAdapter,
  gooseAdapter,
  junieAdapter,
  kiroAdapter,
  mistralVibeAdapter,
  nanobotAdapter,
  opencodeAdapter,
  piAdapter,
  rooCodeAdapter,
];

/** Look up an adapter by name, or undefined if not registered. */
export function agentByName(name: string): AgentAdapter | undefined {
  return ALL_AGENTS.find((a) => a.name === name);
}
