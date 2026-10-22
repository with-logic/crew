/** Own one private store staging path through publication or failure cleanup (§9 step 8, §13). */

import { mkdtempSync } from "node:fs";
import { displayText } from "../refs/display-url.ts";
import { rmrf } from "../util/fs.ts";
import { sanitizeLine } from "../util/redact.ts";

/** Publish synchronously; only this allocation is released when publication throws. */
export function withStoreStaging(storePath: string, publish: (staging: string) => void): void {
  const staging = mkdtempSync(`${storePath}.staging-`);
  try {
    publish(staging);
  } catch (err) {
    try {
      rmrf(staging);
    } catch (cleanupError) {
      // These filesystem/validation operations throw native Error or CrewError (§9 step 8).
      const primary = err as Error;
      primary.message += sanitizeLine(
        displayText(
          `; store staging cleanup failed; retained path \`${staging}\`: ${(cleanupError as Error).message}`,
        ),
      );
    }
    throw err;
  }
}
