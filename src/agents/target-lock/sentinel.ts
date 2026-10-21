/** Reserved entries below a trusted physical adapter base never follow links (§14). */
import { lstatSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../core/errors.ts";

/** Prepare the sentinel exclusively; existing regular files are never opened for writing. */
export function prepareTargetSentinel(base: string): string {
  const target = join(base, ".crew-target");
  const lock = lstatSync(`${target}.lock`, { throwIfNoEntry: false });
  if (lock && !lock.isDirectory()) reject(`${target}.lock`);
  try {
    writeFileSync(target, "", { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    if (!lstatSync(target).isFile()) reject(target);
  }
  return target;
}

function reject(path: string): never {
  throw new CrewError(
    "usage_error",
    `reserved target coordination entry has an unsupported type: ${path}`,
  );
}
