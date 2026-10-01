/** Auto-tap garbage collection after uninstall (§7.4, §14). */
import { readConfig, writeConfig } from "../../config/load.ts";
import { tapPath } from "../../core/paths.ts";
import type { Config, StateFile } from "../../core/types.ts";
import { withTapLocks } from "../../sources/tap-lock.ts";
import { rmrf } from "../../util/fs.ts";

/**
 * Drop auto taps (registered: false) that no longer back any state
 * entry. Their on-disk clone is deleted. Registered taps are NEVER
 * gc'd by this — only the user's `crew tap remove` removes them.
 */
export function gcAutoTaps(state: StateFile, home: string): void {
  const config: Config = readConfig(home);
  const inUse = new Set(state.installations.map((e) => e.source.tap));
  const survivors = config.taps.filter((t) => t.registered || inUse.has(t.name));
  if (survivors.length === config.taps.length) return; // nothing to gc
  const removed = config.taps.filter((t) => !survivors.includes(t));
  withTapLocks(removed, home, () => {
    writeConfig({ ...config, taps: survivors }, home);
    for (const tap of removed) {
      if (tap.kind === "git") rmrf(tapPath(tap.name, home));
    }
  });
}
