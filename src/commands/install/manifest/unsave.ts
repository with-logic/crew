/**
 * `crew uninstall --save <ref>...` (§9.2): take references out of the
 * project's manifest, then install from it, which removes the skills those
 * lines brought in.
 *
 * The other half of `./save.ts`, and built from the same pieces: the edit
 * is checked before the file is written, and the file is put back if the
 * install that follows does not succeed.
 */

import { dirname } from "node:path";
import { CrewError } from "../../../core/errors.ts";
import { MANIFEST_FILENAME, removeManifestLines } from "../../../manifest/index.ts";
import { redactText, safePath } from "../../../util/redact.ts";
import type { CommandContext, CommandOutput } from "../../types.ts";
import {
  installFromEditedManifest,
  manifestLineFor,
  manifestToEdit,
  rejectUnsavableFlags,
} from "./save.ts";

/** Flags of `crew uninstall` that select skills some other way than a manifest line. */
const SELECTION_FLAGS = ["all", "prune"] as const;

/**
 * Remove the command line's references from the manifest and run `install`,
 * a bare install, from the manifest's directory.
 */
export function unsaveThenInstall(
  ctx: CommandContext,
  install: (bare: CommandContext) => CommandOutput,
): CommandOutput {
  rejectUnsavableFlags(ctx);
  for (const flag of SELECTION_FLAGS) {
    if (!ctx.flags.extras[flag]) continue;
    throw new CrewError(
      "usage_error",
      `\`--save\` removes lines from \`${MANIFEST_FILENAME}\` and lets the next install drop their skills — it cannot be combined with \`--${flag}\``,
    );
  }
  if (ctx.flags.agent.length > 0) {
    throw new CrewError(
      "usage_error",
      `\`--save\` removes a line from \`${MANIFEST_FILENAME}\` for every agent — it cannot be combined with \`--agent\``,
    );
  }
  if (ctx.positional.length === 0) {
    throw new CrewError(
      "usage_error",
      `\`crew uninstall --save\` needs at least one reference to remove from \`${MANIFEST_FILENAME}\`, written as it appears there`,
    );
  }
  const { file, before } = manifestToEdit(ctx.cwd);
  if (before === null) {
    throw new CrewError(
      "usage_error",
      `\`crew uninstall --save\` found no \`${MANIFEST_FILENAME}\` for this directory`,
    );
  }
  const projectRoot = dirname(file);
  const lines = ctx.positional.map((ref) => manifestLineFor({ ref, cwd: ctx.cwd, projectRoot }));
  const edit = removeManifestLines(before, lines);
  const removed = new Set(edit.changedRefs);
  // A reference that names no line was typed by hand and may hold a
  // credential, so it is redacted wherever it is repeated (§5.2).
  const absent = lines.filter((line) => !removed.has(line.trim())).map((line) => redactText(line));
  if (absent.length > 0) {
    throw new CrewError(
      "usage_error",
      `${safePath(file)} has no line \`${absent[0]}\` — give the reference exactly as the file writes it`,
      { file, refs: absent },
    );
  }
  const { output, succeeded } = installFromEditedManifest(
    ctx,
    { file, before, edit, extras: {} },
    install,
  );
  // stderr is not printed under `--json`, where an empty `unsaved` says the same.
  if (!succeeded) return { ...output, json: { ...(output.json as object), unsaved: [] } };
  const summary = `Removed from ${safePath(file)}: ${edit.changedRefs.map((ref) => safePath(ref)).join(", ")}`;
  return {
    ...output,
    human: [summary, "", ...(output.human ?? [])],
    json: { ...(output.json as object), unsaved: edit.changedRefs },
  };
}
