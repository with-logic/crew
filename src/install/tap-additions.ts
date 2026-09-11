/**
 * Newly-added tap children during re-expansion (§10.1.1 step 1).
 *
 * Split out of `tap-reexpand.ts` (200-line cap): given the children a
 * tap currently exposes and the names already in state, decide which
 * are new, validate each in full, and either report the addition
 * (`--dry-run`) or install it.
 */

import type { CrewError } from "../core/errors.ts";
import type { Scope, StateEntry, TapConfig } from "../core/types.ts";
import { loadSkill } from "../skill/load.ts";
import type { CurrentTapChild } from "./tap-children.ts";
import type { InstallNewChild, TapReexpandRow } from "./tap-reexpand.ts";

export interface AdditionsInput {
  readonly children: readonly CurrentTapChild[];
  readonly conflictedNames: ReadonlySet<string>;
  readonly memberNames: ReadonlySet<string>;
  readonly scope: Scope;
  readonly tap: TapConfig;
  readonly agents: readonly string[];
  readonly resolvedSha: string | null;
  readonly projectRoot: string | null;
  readonly dryRun: boolean;
  readonly installOne: InstallNewChild;
}

export interface AdditionsResult {
  readonly added: readonly StateEntry[];
  readonly rows: readonly TapReexpandRow[];
  readonly hardFailure: boolean;
}

export function collectAdditions(input: AdditionsInput): AdditionsResult {
  const added: StateEntry[] = [];
  const rows: TapReexpandRow[] = [];
  let hardFailure = false;

  for (const child of input.children) {
    if (input.conflictedNames.has(child.name)) continue;
    if (input.memberNames.has(child.name)) continue;

    // §9 step 4: discovery only validated the declared name, so a child
    // can reach here with (say) no `description`. Validate in full
    // before reporting or installing, so the preview and the real run
    // agree and an invalid child never lands on disk.
    const invalid = validationErrorFor(child.path);
    if (invalid) {
      hardFailure = true;
      rows.push({
        name: child.name,
        scope: input.scope,
        tap: input.tap.name,
        kind: "tap_error",
        error: { code: invalid.code ?? "invalid_skill", message: invalid.message },
      });
      continue;
    }
    if (input.dryRun) {
      rows.push({
        name: child.name,
        scope: input.scope,
        tap: input.tap.name,
        kind: "would_add",
      });
      continue;
    }
    const entry = input.installOne({
      skillDir: child.path,
      skillName: child.name,
      tapRelativePath: child.tapRelativePath,
      scope: input.scope,
      tap: input.tap,
      agents: input.agents,
      resolvedSha: input.resolvedSha,
      projectRoot: input.projectRoot,
    });
    if (entry) {
      added.push(entry);
      rows.push({ name: child.name, scope: input.scope, tap: input.tap.name, kind: "added" });
    }
  }

  return { added, rows, hardFailure };
}

/**
 * Full spec validation (§9 step 4) for a discovered child, returning
 * the failure instead of throwing. `loadSkill` is the same validator
 * the install flow uses.
 */
function validationErrorFor(skillDir: string): CrewError | null {
  try {
    loadSkill(skillDir);
    return null;
  } catch (err) {
    // `loadSkill` only throws `invalid_skill` CrewErrors.
    return err as CrewError;
  }
}
