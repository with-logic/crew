/**
 * Adapter registry.
 *
 * All adapters crew supports are registered here. Order is stable so
 * `crew targets` output is deterministic.
 */

import type { TargetAdapter } from "./adapter.ts";
import { claudeCodeAdapter } from "./claude-code.ts";
import { codexAdapter } from "./codex.ts";
import { geminiCliAdapter } from "./gemini-cli.ts";

/** Every adapter crew ships. */
export const ALL_ADAPTERS: readonly TargetAdapter[] = [
  claudeCodeAdapter,
  codexAdapter,
  geminiCliAdapter,
];

/** Look up an adapter by name, or undefined if not registered. */
export function adapterByName(name: string): TargetAdapter | undefined {
  return ALL_ADAPTERS.find((a) => a.name === name);
}
