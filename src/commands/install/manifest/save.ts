/**
 * `crew install --save <ref>...` (§9.2): add references to the project's
 * manifest, then install from it.
 *
 * The edit is validated before the file is written, and the file is put
 * back as it was if the install that follows does not succeed, so a failed
 * `--save` leaves `.crewrc` unchanged.
 */

import { rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { CrewError } from "../../../core/errors.ts";
import {
  addManifestLines,
  loadManifestFor,
  MANIFEST_FILENAME,
  type ManifestEdit,
  parseManifest,
  readFileAt,
} from "../../../manifest/index.ts";
import { parseRef } from "../../../refs/parse.ts";
import { toPosix, writeText } from "../../../util/fs.ts";
import { safePath } from "../../../util/redact.ts";
import type { CommandContext, CommandOutput } from "../../types.ts";
import { normalizeFromGit } from "../from-git.ts";

/** True when the run asked for `--save`. */
export function wantsSave(ctx: CommandContext): boolean {
  return Boolean(ctx.flags.extras["save"]);
}

/** The manifest a `--save` edits: the one governing `cwd`, or a new one in `cwd`. */
function manifestToEdit(cwd: string): { file: string; before: string | null } {
  // Parsing it here refuses to edit a manifest that is already invalid.
  const governing = loadManifestFor(cwd);
  if (governing === null) return { file: join(cwd, MANIFEST_FILENAME), before: null };
  // `loadManifestFor` just read this as a regular file.
  const found = readFileAt(governing.file) as { readonly text: string };
  return { file: governing.file, before: found.text };
}

/**
 * The line to write for a reference given on the command line. A path is
 * given relative to where the command ran, and is written relative to the
 * manifest's directory, which is what a manifest line means.
 */
function manifestLineFor(ref: string, cwd: string, projectRoot: string): string {
  let source: ReturnType<typeof parseRef>;
  try {
    source = parseRef(ref, cwd);
  } catch {
    return ref; // Not a reference at all: `parseManifest` reports it, with its line.
  }
  if (source.type !== "path") return ref;
  const fromRoot = toPosix(relative(projectRoot, source.path));
  return fromRoot.startsWith("../") ? fromRoot : `./${fromRoot}`;
}

/** `--save` writes the manifest and installs at project scope; refuse what contradicts that. */
function rejectUnsavableFlags(ctx: CommandContext): void {
  if (ctx.flags.dryRun) {
    throw new CrewError(
      "usage_error",
      "`--save` writes `.crewrc`, so it cannot be combined with `--dry-run`",
    );
  }
  if (ctx.flags.extras["latest"]) {
    throw new CrewError(
      "usage_error",
      "`--latest` takes no references and `--save` needs one — run `crew install --save <ref>`, then `crew install --latest`",
    );
  }
  if (ctx.flags.scopeGiven && ctx.flags.scope === "user") {
    throw new CrewError(
      "usage_error",
      `\`--save\` records skills in \`${MANIFEST_FILENAME}\`, which installs at project scope — drop \`--scope user\``,
    );
  }
}

/** A manifest edit ready to apply: the file, its text before, and its text after. */
interface PendingEdit {
  readonly file: string;
  /** The file's text before the edit; null when the edit creates it. */
  readonly before: string | null;
  readonly edit: ManifestEdit;
  /** Command-scoped flags to hand to the bare install. */
  readonly extras: CommandContext["flags"]["extras"];
}

/**
 * Write the edited manifest and run `install`, a bare install, from its
 * directory. If that raises or exits non-zero, the manifest is put back
 * exactly as it was, or removed if this run created it. Returns the
 * install's output and whether it succeeded.
 */
function installFromEditedManifest(
  ctx: CommandContext,
  pending: PendingEdit,
  install: (bare: CommandContext) => CommandOutput,
): { output: CommandOutput; succeeded: boolean } {
  const { file, before, edit, extras } = pending;
  // Checked before anything is written: an invalid line never reaches the file.
  parseManifest({ text: edit.text, file });
  const wrote = edit.changedRefs.length > 0;
  if (wrote) writeText(file, edit.text);
  const restore = (): void => {
    if (wrote && before === null) rmSync(file, { force: true });
    if (wrote && before !== null) writeText(file, before);
  };
  const bare: CommandContext = {
    ...ctx,
    positional: [],
    cwd: dirname(file),
    flags: { ...ctx.flags, extras },
  };
  let output: CommandOutput;
  try {
    output = install(bare);
  } catch (err) {
    restore();
    throw err;
  }
  if (output.exitCode === 0) return { output, succeeded: true };
  restore();
  const note = `${safePath(file)} was left as it was, because the install did not succeed.`;
  return { output: { ...output, stderr: [...(output.stderr ?? []), note] }, succeeded: false };
}

/**
 * `crew install --save`: add the command line's references to the manifest
 * and install from it.
 */
export function saveThenInstall(
  ctx: CommandContext,
  install: (bare: CommandContext) => CommandOutput,
): CommandOutput {
  rejectUnsavableFlags(ctx);
  const { "from-git": fromGit, save: _save, ...extras } = ctx.flags.extras;
  const given = [...ctx.positional];
  if (typeof fromGit === "string") given.push(normalizeFromGit(fromGit, ctx.cwd));
  if (given.length === 0) {
    throw new CrewError(
      "usage_error",
      "`crew install --save` needs at least one skill reference to add to `.crewrc`",
    );
  }
  const { file, before } = manifestToEdit(ctx.cwd);
  const lines = given.map((ref) => manifestLineFor(ref, ctx.cwd, dirname(file)));
  const edit = addManifestLines(before ?? "", lines);
  const { output, succeeded } = installFromEditedManifest(
    ctx,
    { file, before, edit, extras },
    install,
  );
  if (!succeeded) return output;
  const added = edit.changedRefs;
  const summary =
    added.length === 0
      ? `${safePath(file)} already lists ${given.length === 1 ? "that reference" : "those references"}.`
      : `Added to ${safePath(file)}: ${added.map((ref) => safePath(ref)).join(", ")}`;
  return {
    ...output,
    human: [summary, "", ...(output.human ?? [])],
    json: { ...(output.json as object), saved: added },
  };
}
