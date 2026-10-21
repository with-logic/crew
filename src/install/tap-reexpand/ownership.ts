/** Preflight new-child source ownership before any target changes (§5.4, §10.1.1). */

import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { baseFor } from "../../agents/adapter.ts";
import { agentByName } from "../../agents/registry.ts";
import { CrewError } from "../../core/errors.ts";
import type { TapConfig } from "../../core/types.ts";
import {
  type InstalledSourceIndex,
  indexHasDifferentOrUnresolvedSource,
  type LookupArgs,
} from "../installed-lookup.ts";
import { sameSourceIdentity, sourceIdentityOf } from "../source-identity.ts";

/**
 * Reject different/unresolved state or target-marker sources with `name_conflict`.
 * Absent markers retain the installer's untracked-directory/force rules (§13).
 */
export function assertChildSourceOwnership(
  index: InstalledSourceIndex,
  args: LookupArgs,
  agents: readonly string[],
): void {
  const conflict = (dest?: string): never => {
    throw new CrewError(
      "name_conflict",
      `Cannot add \`${args.name}\`: its existing source differs or cannot be established${dest ? ` at \`${dest}\`` : ""}. Investigate its ownership metadata or uninstall the existing skill before switching sources; --force does not bypass this check.`,
    );
  };
  if (indexHasDifferentOrUnresolvedSource(index, args)) conflict();
  const incoming = sourceIdentityOf(args.tap, args.tapRelativePath);
  const checked = new Set<string>();
  for (const name of agents) {
    const adapter = agentByName(name);
    if (!adapter) continue;
    const base = baseFor(adapter, args.scope, args.projectRoot ?? "");
    if (!base) continue;
    const dest = join(base, args.name);
    if (checked.has(dest)) continue;
    checked.add(dest);
    const marker = join(dest, ".crew.json");
    try {
      const stat = lstatSync(marker, { throwIfNoEntry: false });
      if (!stat) continue;
      if (!stat.isFile()) conflict(dest);
      const raw: unknown = JSON.parse(readFileSync(marker, "utf8"));
      const source = markerSource(raw, args);
      if (!(source && sameSourceIdentity(sourceIdentityOf(source.tap, source.path), incoming)))
        conflict(dest);
    } catch (err) {
      // A non-directory destination has no marker; §13 still governs untracked paths.
      if ((err as NodeJS.ErrnoException).code === "ENOTDIR") continue;
      conflict(dest);
    }
  }
}

/** Validate only ownership metadata here; markers are untrusted JSON (§11.1). */
function markerSource(raw: unknown, args: LookupArgs): { tap: TapConfig; path: string } | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (
    m["schema_version"] !== 1 ||
    m["name"] !== args.name ||
    m["scope"] !== args.scope ||
    typeof m["tap_name"] !== "string" ||
    typeof m["path"] !== "string" ||
    isAbsolute(m["path"]) ||
    typeof m["tap_url"] !== "string" ||
    typeof m["tap_subpath"] !== "string" ||
    typeof m["tap_path"] !== "string"
  )
    return null;
  const kind = m["tap_kind"];
  if (kind !== "git" && kind !== "path") return null;
  if (kind === "git" ? m["tap_url"].length === 0 : !isAbsolute(m["tap_path"])) return null;
  return {
    tap: {
      name: m["tap_name"],
      kind,
      registered: false,
      url: m["tap_url"],
      subpath: m["tap_subpath"],
      path: m["tap_path"],
    },
    path: m["path"],
  };
}
