/**
 * Scope targeting for `crew uninstall` (§7.4 "Scope").
 *
 * A selector names a skill; `--scope` picks which installed entry of
 * that skill the command acts on. Without `--scope` (or with `--scope
 * user`) only the user-scope entry is a candidate. With `--scope
 * project`, the candidate is the entry whose `project_root` is the cwd,
 * falling back to the single project-scope entry when exactly one
 * exists so schedulers can run the command from any directory.
 *
 * When the selector only matches entries at other scopes, the error
 * names where the skill *is* installed and the command to remove it.
 */

import { CrewError } from "../../core/errors.ts";
import type { Scope, StateEntry } from "../../core/types.ts";
import type { StateSubject } from "../../state/subjects.ts";
import { shortenHome } from "../../util/format.ts";

/** Narrow `subject.entries` to the ones the requested scope targets. */
export function narrowSubjectToScope(
  subject: StateSubject,
  scope: Scope,
  cwd: string,
  force: boolean,
): StateSubject {
  const entries = entriesAtScope(subject.entries, scope, cwd);
  if (entries.length > 0 || subject.entries.length === 0 || force) {
    return { ...subject, entries };
  }
  throw new CrewError(
    "not_installed_here",
    `\`${subject.raw}\` isn't installed at ${describeScope(scope, cwd)} — nothing to remove`,
    {
      name: subject.raw,
      scope,
      installed_at: subject.entries.map((e) => ({
        scope: e.scope,
        project_root: e.project_root ?? null,
      })),
    },
    remedyFor(subject, scope),
  );
}

function entriesAtScope(
  entries: readonly StateEntry[],
  scope: Scope,
  cwd: string,
): readonly StateEntry[] {
  if (scope === "user") return entries.filter((e) => e.scope === "user");
  const projects = entries.filter((e) => e.scope === "project");
  const here = projects.filter((e) => e.project_root === cwd);
  if (here.length > 0) return here;
  // §7.4: a lone project install is reachable from any cwd.
  return projects.length === 1 ? projects : [];
}

function describeScope(scope: Scope, cwd: string): string {
  return scope === "user" ? "user scope" : `project scope in ${shortenHome(cwd)}`;
}

function remedyFor(subject: StateSubject, scope: Scope): string {
  const lines = subject.entries.map((e) => {
    if (e.scope === "user") {
      const flag = scope === "user" ? "" : " — drop `--scope project`";
      return `installed at user scope${flag}: crew uninstall ${subject.raw}`;
    }
    const root = shortenHome(e.project_root ?? "");
    return `installed at project scope in ${root}: cd ${root} && crew uninstall --scope project ${subject.raw}`;
  });
  return `${lines.join("\n")}\nOr add \`--force\` to treat this as a no-op.`;
}
