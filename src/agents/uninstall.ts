/**
 * Target uninstall operations (§7.4).
 *
 * Multiple adapters may share one install directory, so uninstall removes only
 * the requesting adapters' marker ownership unless this was the last owner.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { Marker, Scope } from "../core/types.ts";
import { rmrf } from "../util/fs.ts";
import { tryReadJson, writeJson } from "../util/json.ts";
import { type AgentAdapter, baseFor } from "./adapter.ts";

/** Input to uninstall from one `dest` shared by a group of agents. */
export interface UninstallInput {
  /** The agents whose ownership of this dest is being removed. */
  readonly agents: readonly AgentAdapter[];
  readonly scope: Scope;
  readonly cwd: string;
  readonly skillName: string;
  readonly force: boolean;
}

/** Outcome of one uninstall operation on a physical dest. */
export type UninstallOutcome =
  /** Bytes removed; this was the last adapter owning the dest. */
  | { kind: "removed" }
  /** Ownership removed from the marker; bytes stay because other adapters still own them. */
  | { kind: "detached"; remaining: readonly string[] }
  /** No marker existed; nothing to do. */
  | { kind: "absent" };

/** Remove adapter ownership from a physical dest. Throws on abort. */
export function uninstallSkillFromAgents(input: UninstallInput): UninstallOutcome {
  const base = baseFor(input.agents[0]!, input.scope, input.cwd);
  const dest = join(base, input.skillName);
  if (!existsSync(dest)) return missingInstall(input, dest, base);
  const marker = tryReadJson<Marker>(join(dest, ".crew.json"));
  if (!marker) return untrackedInstall(input, dest);
  if (marker.name !== input.skillName) return inconsistentMarker(input, marker, dest);
  return removeAdapterOwnership(input, marker, dest);
}

function missingInstall(input: UninstallInput, dest: string, base: string): UninstallOutcome {
  if (!input.force)
    throw new CrewError(
      "not_installed_here",
      `\`${input.skillName}\` isn't installed in \`${base}\``,
      {
        dest,
      },
    );
  return { kind: "absent" };
}

function untrackedInstall(input: UninstallInput, dest: string): UninstallOutcome {
  if (!input.force)
    throw new CrewError(
      "untracked_directory",
      `\`${dest}\` exists but isn't crew-managed (no .crew.json) — refusing to remove`,
      { dest },
    );
  rmrf(dest);
  return { kind: "removed" };
}

function inconsistentMarker(input: UninstallInput, marker: Marker, dest: string): UninstallOutcome {
  if (!input.force)
    throw new CrewError(
      "inconsistent_marker",
      `\`${dest}\` has a crew marker for \`${marker.name}\`, not \`${input.skillName}\` — investigate before forcing`,
      { dest, markerName: marker.name, incomingName: input.skillName },
    );
  rmrf(dest);
  return { kind: "removed" };
}

function removeAdapterOwnership(
  input: UninstallInput,
  marker: Marker,
  dest: string,
): UninstallOutcome {
  const leaving = new Set(input.agents.map((a) => a.name));
  const remaining = (marker.agents ?? []).filter((a) => !leaving.has(a));
  if (remaining.length === 0) {
    rmrf(dest);
    return { kind: "removed" };
  }
  writeJson(join(dest, ".crew.json"), { ...marker, agents: remaining.sort() });
  return { kind: "detached", remaining };
}
