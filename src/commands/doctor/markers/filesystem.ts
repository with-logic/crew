/** Strict doctor inventory reads distinguish absence from operational failures (§11.2). */
import { accessSync, type BigIntStats, constants, lstatSync, readdirSync, statSync } from "node:fs";
import type { Finding } from "../findings/index.ts";
import {
  type InventoryProblem,
  inventoryProblemFinding,
  linkedInventoryProblem,
  unreadableInventoryProblem,
} from "./findings.ts";

/** Inspect/search every lexical directory even when another alias has a cached inventory. */
export function inspectInventoryDirectory(
  path: string,
  problems: InventoryProblem[],
  followLinks = true,
): BigIntStats | undefined {
  try {
    const entry = followLinks
      ? statSync(path, { bigint: true })
      : lstatSync(path, { bigint: true });
    if (entry.isSymbolicLink()) {
      problems.push(linkedInventoryProblem(path));
      return undefined;
    }
    if (!entry.isDirectory()) return undefined;
    accessSync(path, constants.X_OK);
    return entry;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && code !== "ENOTDIR")
      problems.push(unreadableInventoryProblem(path, err));
    return undefined;
  }
}

/** Project-root gating retains existing path-specific findings and absent-root behavior. */
export function inventoryDirectory(path: string, findings: Map<string, Finding>): boolean {
  const problems: InventoryProblem[] = [];
  const entry = inspectInventoryDirectory(path, problems);
  for (const problem of problems) findings.set(...inventoryProblemFinding(problem));
  return entry !== undefined;
}

/** Enumerate an inspected base; a failed listing must block repair, not look empty. */
export function inventoryNames(path: string, problems: InventoryProblem[]): string[] {
  try {
    return readdirSync(path);
  } catch (err) {
    problems.push(unreadableInventoryProblem(path, err));
    return [];
  }
}

/** Retained diagnostic entry point for existing linked-inventory callers. */
export function inventoryLinkFailure(path: string, findings: Map<string, Finding>): void {
  findings.set(...inventoryProblemFinding(linkedInventoryProblem(path)));
}
