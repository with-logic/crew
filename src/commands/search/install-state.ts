/**
 * Source-aware installed-state lookup for `crew search` (§16.6).
 */

import type { StateFile, StateSource } from "../../core/types.ts";

export interface SearchInstallStatus {
  readonly installed: boolean;
  readonly same_name_installed: boolean;
}

export interface SearchInstallIndex {
  readonly sourcesByName: ReadonlyMap<string, readonly StateSource[]>;
}

export function buildSearchInstallIndex(state: StateFile): SearchInstallIndex {
  const sourcesByName = new Map<string, StateSource[]>();
  for (const entry of state.installations) {
    const sources = sourcesByName.get(entry.name);
    if (sources) sources.push(entry.source);
    else sourcesByName.set(entry.name, [entry.source]);
  }
  return { sourcesByName };
}

export function searchInstallStatus(
  index: SearchInstallIndex,
  name: string,
  tap: string,
  tapRelativePath: string,
): SearchInstallStatus {
  const sources = index.sourcesByName.get(name) ?? [];
  const installed = sources.some((s) => s.tap === tap && s.path === tapRelativePath);
  return { installed, same_name_installed: !installed && sources.length > 0 };
}
