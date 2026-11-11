/**
 * Human output for the removal records of a bare `crew install` (§9.2):
 * skills the project manifest no longer accounts for. A record may be a
 * completed removal, a dry-run preview, or an attempt a safety check aborted.
 */

import { MANIFEST_FILENAME } from "../../../manifest/index.ts";
import type { CommandContext } from "../../types.ts";
import type { UninstallRecord } from "../../uninstall/core.ts";
import { renderUninstall } from "../../uninstall/render.ts";

/** Lines to append after the install report; empty when there are no removal records to render. */
export function renderDropped(records: readonly UninstallRecord[], ctx: CommandContext): string[] {
  if (records.length === 0) return [];
  return [
    "",
    ctx.style.bold(`No longer required by ${MANIFEST_FILENAME}`),
    ...renderUninstall(records, ctx.flags.dryRun, ctx.style),
  ];
}
