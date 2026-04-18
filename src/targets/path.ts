/**
 * Small helpers used by target adapters for detection.
 */

import { existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * Is `binary` on the user's `PATH`? Scanned manually because `Bun.which`
 * is Bun-specific and we want tests to be able to redirect `PATH`
 * temporarily without extra plumbing.
 */
export function isOnPath(binary: string): boolean {
  const envPath = process.env.PATH ?? "";
  if (envPath.length === 0) return false;
  for (const dir of envPath.split(delimiter)) {
    if (dir.length === 0) continue;
    const candidate = join(dir, binary);
    if (!existsSync(candidate)) continue;
    const st = statSync(candidate);
    // Execute-bit check is approximate (mode may be masked by fs) but
    // enough for detection: any regular file at this path indicates the
    // binary is installed.
    if (st.isFile() || st.isSymbolicLink()) return true;
  }
  return false;
}
