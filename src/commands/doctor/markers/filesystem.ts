/** Strict doctor inventory reads distinguish absence from operational failures (§11.2). */
import { accessSync, constants, readdirSync, statSync } from "node:fs";
import { redactText, sanitizeLine } from "../../../util/redact.ts";
import type { Finding } from "../checks.ts";

/** Existing directories must be searchable before their marker inventory can be trusted. */
export function inventoryDirectory(path: string, findings: Map<string, Finding>): boolean {
  try {
    if (!statSync(path).isDirectory()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR") inventoryReadFailure(path, err, findings);
    return false;
  }
}

/** Enumerate only readable bases; a failed listing must block repair, not look empty. */
export function inventoryNames(path: string, findings: Map<string, Finding>): string[] {
  if (!inventoryDirectory(path, findings)) return [];
  try {
    return readdirSync(path);
  } catch (err) {
    inventoryReadFailure(path, err, findings);
    return [];
  }
}

/** Retain the failed path and original diagnostic without leaking terminal controls or credentials. */
export function inventoryReadFailure(
  path: string,
  err: unknown,
  findings: Map<string, Finding>,
): void {
  findings.set(`marker_unreadable\0${path}`, {
    level: "error",
    code: "marker_unreadable",
    message: sanitizeLine(redactText(`${path}: ${(err as Error).message}`)),
  });
}
