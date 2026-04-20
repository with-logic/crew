/**
 * List every crew-installed skill under a target.
 *
 * Enumerates the immediate children of the adapter's base directory,
 * reads each `.crew.json` marker, and returns the records. Directories
 * without a marker are ignored (we don't touch them).
 */

import { join } from "node:path";
import type { Marker, Scope } from "../core/types.ts";
import { isDirectory, listDir } from "../util/fs.ts";
import { tryReadJson } from "../util/json.ts";
import { baseFor, type InstalledSkillRecord, type TargetAdapter } from "./adapter.ts";

/**
 * List every crew-installed skill for one adapter at one scope. The
 * result includes only markers whose `adapters` list names this
 * adapter, so path-shared installs show up for every owner but a
 * marker owned solely by adapter X won't appear when walking adapter Y.
 */
export function listInstalledForTarget(
  adapter: TargetAdapter,
  scope: Scope,
  cwd: string,
): InstalledSkillRecord[] {
  const base = baseFor(adapter, scope, cwd);
  if (base === "" || !isDirectory(base)) {
    return [];
  }
  const records: InstalledSkillRecord[] = [];
  for (const name of listDir(base)) {
    const installDir = join(base, name);
    if (!isDirectory(installDir)) {
      continue;
    }
    const marker = tryReadJson<Marker>(join(installDir, ".crew.json"));
    if (!marker) {
      continue;
    }
    if (!marker.adapters?.includes(adapter.name)) {
      continue;
    }
    records.push({ adapter: adapter.name, scope, installDir, marker });
  }
  return records;
}
