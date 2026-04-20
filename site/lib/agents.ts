/**
 * The agents crew installs into. Sourced from the §7.2 table in the
 * CLI's PRD. Kept alphabetical so the rendered chips match `crew agents`.
 */

export interface Agent {
  readonly name: string;
  /** Human-readable display name, e.g. for richer UI. */
  readonly display: string;
}

export const AGENTS: readonly Agent[] = [
  { name: "amp", display: "Amp" },
  { name: "autohand", display: "Autohand" },
  { name: "claude-code", display: "Claude Code" },
  { name: "codex", display: "Codex" },
  { name: "command-code", display: "Command Code" },
  { name: "cursor", display: "Cursor" },
  { name: "factory", display: "Factory" },
  { name: "gemini-cli", display: "Gemini CLI" },
  { name: "github-copilot", display: "GitHub Copilot" },
  { name: "goose", display: "Goose" },
  { name: "junie", display: "Junie" },
  { name: "kiro", display: "Kiro" },
  { name: "mistral-vibe", display: "Mistral Vibe" },
  { name: "nanobot", display: "Nanobot" },
  { name: "opencode", display: "OpenCode" },
  { name: "pi", display: "pi" },
  { name: "roo-code", display: "Roo Code" },
];
