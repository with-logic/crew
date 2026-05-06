import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The full text of the PRD, read from disk at build time and inlined
 * into the static bundle. Used by the "Build it yourself" (SaaP)
 * callout to hand the spec to an agent coder in one click.
 *
 * Relative to `site/`, the PRD lives at `../PRD.md`. `process.cwd()`
 * during `next build` is the site/ dir, so a relative path works.
 */
export const PRD_CONTENT: string = readFileSync(join(process.cwd(), "..", "PRD.md"), "utf8");

/** Preamble that frames the task for the agent. Prepended to the PRD. */
export const SAAP_PREAMBLE = `You are going to implement Homecrew, a working \`crew\` executable and package manager for agent skills (the SKILL.md spec at agentskills.io), from the PRD that follows this preamble.

Rules:
- The PRD is the contract. Build to spec.
- Ask me which language and runtime to use before writing any code. Popular choices: TypeScript (Bun, Deno, Node), Go, Rust, Python, Swift. Pick with me; don't decide unilaterally.
- After I choose, scaffold the project, implement the CLI, and write tests that map to the §18 conformance criteria.
- Ship a single macOS-installable binary (or the language's closest equivalent).
- Match the PRD literally on commands, flags, file layouts, error codes, and marker schemas. Every command in §5.2 must exist with the documented behavior.

---

`;

/** Preamble + PRD body — the full clipboard payload. */
export const SAAP_FULL_PROMPT: string = SAAP_PREAMBLE + PRD_CONTENT;
