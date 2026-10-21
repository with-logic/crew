/** Doctor-local marker inventory preserves missing versus unreadable/invalid distinctions (§11.2). */
import { lstatSync } from "node:fs";
import { join } from "node:path";
import { type AgentAdapter, baseFor, type InstalledSkillRecord } from "../../../agents/adapter.ts";
import type { Scope } from "../../../core/types.ts";
import { readJson } from "../../../util/json.ts";
import { redactText, sanitizeLine } from "../../../util/redact.ts";
import type { Finding } from "../checks.ts";
import {
  inventoryDirectory,
  inventoryLinkFailure,
  inventoryNames,
  inventoryReadFailure,
} from "./filesystem.ts";
import { isDoctorMarker } from "./validate.ts";

/**
 * Return valid records and path-keyed findings for one adapter/scope. Missing
 * markers (ENOENT) are omitted; unreadable/invalid markers emit findings that block repair.
 */
export function scanMarkers(
  adapter: AgentAdapter,
  scope: Scope,
  cwd: string,
): { records: InstalledSkillRecord[]; findings: Map<string, Finding> } {
  const base = baseFor(adapter, scope, cwd);
  const records: InstalledSkillRecord[] = [];
  const findings = new Map<string, Finding>();
  if (base === "") return { records, findings };
  for (const name of inventoryNames(base, findings)) {
    const installDir = join(base, name);
    if (!inventoryDirectory(installDir, findings, false)) continue;
    const path = join(installDir, ".crew.json");
    let marker: unknown = null;
    try {
      if (lstatSync(path).isSymbolicLink()) {
        inventoryLinkFailure(path, findings);
        continue;
      }
      marker = readJson<unknown>(path);
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        inventoryReadFailure(path, err, findings);
        continue;
      }
      // Malformed JSON leaves null so the field-validation path reports marker_invalid.
    }
    if (!isDoctorMarker(marker)) {
      findings.set(`marker_invalid\0${path}`, {
        level: "error",
        code: "marker_invalid",
        message: sanitizeLine(
          redactText(
            `${path}: invalid marker; correct its JSON, field types, field values and tap metadata before repair`,
          ),
        ),
      });
      continue;
    }
    if (marker.agents.includes(adapter.name))
      records.push({ adapter: adapter.name, scope, installDir, marker });
  }
  return { records, findings };
}
