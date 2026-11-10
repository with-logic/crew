/**
 * Human output for skills a bare `crew install` removed because the
 * project manifest no longer declares them (§9.2).
 */

import { MANIFEST_FILENAME } from "../../../manifest/parse.ts";
import type { CommandContext } from "../../types.ts";
import type { UninstallRecord } from "../../uninstall/core.ts";
import { renderUninstall } from "../../uninstall/render.ts";

/** Lines to append after the install report; empty when nothing was dropped. */
export function renderDropped(records: readonly UninstallRecord[], ctx: CommandContext): string[] {
  if (records.length === 0) return [];
  return [
    "",
    ctx.style.bold(`No longer in ${MANIFEST_FILENAME}`),
    ...renderUninstall(records, ctx.flags.dryRun, ctx.style),
  ];
}
