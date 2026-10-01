/**
 * Shared `--agent` validation against the adapter registry (§5.2, §7.2).
 *
 * `crew install`, `crew uninstall`, and `crew list` all accept `--agent`
 * and all reject an unknown name with the same sentence. Keeping one
 * implementation stops the wording drifting between commands the way it
 * did before — a user who mistypes an agent should read the same
 * diagnostic whichever command they were running.
 *
 * The error *code* differs by caller: install's agent set failing to
 * resolve is `no_agents` (§13), while a bad filter on another command is
 * a plain `usage_error`. That is the one axis callers vary.
 */

import { CrewError } from "../core/errors.ts";
import { ALL_AGENTS, agentByName } from "./registry.ts";

/**
 * The only two codes this diagnostic is ever raised under. Narrower than
 * `CrewErrorName` on purpose: a caller reaching for a third code is
 * describing a different failure and wants its own message, so the
 * compiler should say so rather than let the wording spread.
 */
export type UnknownAgentCode = "usage_error" | "no_agents";

/**
 * Throw if any name is not a registered adapter. Returns nothing; the
 * caller keeps its own input on the happy path.
 */
export function assertKnownAgents(
  names: readonly string[],
  code: UnknownAgentCode = "usage_error",
): void {
  const unknown = names.filter((n) => !agentByName(n));
  if (unknown.length === 0) return;
  const known = ALL_AGENTS.map((a) => a.name).join(", ");
  throw new CrewError(
    code,
    `unknown agent${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")} — known agents: ${known}`,
    { unknown },
  );
}
