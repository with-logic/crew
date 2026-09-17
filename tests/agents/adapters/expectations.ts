/**
 * One row per adapter describing its documented paths and detection
 * signals (§7.2). Data only; the suites in this directory assert against it.
 */

/** Test shape: one row per adapter describing its documented paths. */
export interface AdapterExpectation {
  readonly name: string;
  /** Subpath under $HOME that userPath() must resolve to. */
  readonly userSuffix: string;
  /** Project-scope suffix relative to cwd. Empty string = no project scope. */
  readonly projectSuffix: string;
  /** Subpaths under $HOME to create to trigger detect() === true. */
  readonly detectFixtures: readonly string[];
}

export const EXPECTATIONS: readonly AdapterExpectation[] = [
  {
    name: "agent-skills",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".agents"],
  },
  {
    name: "amp",
    userSuffix: ".config/amp/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".config/amp"],
  },
  {
    name: "antigravity-cli",
    userSuffix: ".gemini/antigravity-cli/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".gemini/antigravity-cli"],
  },
  {
    name: "autohand",
    userSuffix: ".autohand/skills",
    projectSuffix: ".autohand/skills",
    detectFixtures: [".autohand"],
  },
  {
    name: "claude-code",
    userSuffix: ".claude/skills",
    projectSuffix: ".claude/skills",
    detectFixtures: [".claude"],
  },
  {
    name: "codex",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".codex"],
  },
  {
    name: "command-code",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".commandcode"],
  },
  {
    name: "cursor",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".cursor"],
  },
  {
    name: "factory",
    userSuffix: ".factory/skills",
    projectSuffix: ".factory/skills",
    detectFixtures: [".factory"],
  },
  {
    name: "gemini-cli",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".gemini"],
  },
  {
    name: "github-copilot",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".copilot"],
  },
  {
    name: "goose",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".config/goose"],
  },
  {
    name: "junie",
    userSuffix: ".junie/skills",
    projectSuffix: ".junie/skills",
    detectFixtures: [".junie"],
  },
  {
    name: "kiro",
    userSuffix: ".kiro/skills",
    projectSuffix: ".kiro/skills",
    detectFixtures: [".kiro"],
  },
  {
    name: "mistral-vibe",
    userSuffix: ".vibe/skills",
    projectSuffix: ".vibe/skills",
    detectFixtures: [".vibe"],
  },
  {
    name: "nanobot",
    userSuffix: ".nanobot/workspace/skills",
    projectSuffix: "",
    detectFixtures: [".nanobot"],
  },
  {
    name: "opencode",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".config/opencode"],
  },
  {
    name: "pi",
    userSuffix: ".agents/skills",
    projectSuffix: ".agents/skills",
    detectFixtures: [".pi"],
  },
  {
    name: "roo-code",
    userSuffix: ".roo/skills",
    projectSuffix: ".roo/skills",
    detectFixtures: [".roo"],
  },
];
