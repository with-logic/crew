/** Doctor-local marker inventory preserves missing versus unreadable/invalid distinctions (§11.2). */
import { join } from "node:path";
import { type AgentAdapter, baseFor, type InstalledSkillRecord } from "../../../agents/adapter.ts";
import type { Scope } from "../../../core/types.ts";
import { isDirectory, listDir, readText } from "../../../util/fs.ts";
import { redactText, sanitizeLine } from "../../../util/redact.ts";
import type { Finding } from "../checks.ts";
import { isDoctorMarker } from "./validate.ts";

export function scanMarkers(
  adapter: AgentAdapter,
  scope: Scope,
  cwd: string,
): { records: InstalledSkillRecord[]; findings: Map<string, Finding> } {
  const base = baseFor(adapter, scope, cwd);
  const records: InstalledSkillRecord[] = [];
  const findings = new Map<string, Finding>();
  if (base === "") return { records, findings };
  for (const name of listDir(base)) {
    const installDir = join(base, name);
    if (!isDirectory(installDir)) continue;
    const path = join(installDir, ".crew.json");
    let text: string;
    try {
      text = readText(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      findings.set(`marker_unreadable\0${path}`, {
        level: "error",
        code: "marker_unreadable",
        message: sanitizeLine(redactText(`${path}: ${(err as Error).message}`)),
      });
      continue;
    }
    let marker: unknown;
    try {
      marker = JSON.parse(text);
    } catch {
      marker = null;
    }
    if (!isDoctorMarker(marker)) {
      findings.set(`marker_invalid\0${path}`, {
        level: "error",
        code: "marker_invalid",
        message: sanitizeLine(
          redactText(`${path}: invalid marker; correct its JSON and required fields before repair`),
        ),
      });
      continue;
    }
    if (marker.agents.includes(adapter.name))
      records.push({ adapter: adapter.name, scope, installDir, marker });
  }
  return { records, findings };
}
