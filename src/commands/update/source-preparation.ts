/** Finish update-only transport before target admission, sharing pair outcomes (§10.1, §14). */
import {
  acquireGitRevision,
  type GitRevision,
  type PreparedSources,
  revisionKey,
} from "../../sources/acquire/revision.ts";
import { hasUsableProjectRoot } from "../../state/validation.ts";
import type { LockedPlanInput } from "./locked-plan.ts";
import { updateTargetEntries } from "./target-set.ts";

type Outcome =
  | { readonly kind: "ready"; readonly revision: GitRevision }
  | { readonly kind: "failed"; readonly error: unknown };

export function prepareUpdateSources(input: LockedPlanInput): PreparedSources {
  const outcomes = new Map<string, Outcome>();
  for (const entry of updateTargetEntries(input)) {
    if (entry.scope === "project" && !hasUsableProjectRoot(entry)) continue;
    const tap = input.config.taps.find((candidate) => candidate.name === entry.source.tap);
    if (!tap || tap.kind === "path") continue;
    // Exact-SHA ordinary entries skip without acquisition; tracked groups still scan.
    if (
      entry.pinned &&
      entry.ref !== null &&
      /^[0-9a-f]{40}$/i.test(entry.ref) &&
      !input.ctx.flags.force &&
      !entry.tracks_tap
    )
      continue;
    const key = revisionKey(tap, entry.ref);
    if (outcomes.has(key)) continue;
    try {
      outcomes.set(key, {
        kind: "ready",
        revision: acquireGitRevision(tap, entry.ref, input.home),
      });
    } catch (error) {
      outcomes.set(key, { kind: "failed", error });
    }
  }
  return {
    revisionFor(tap, ref) {
      // Every consumer, including added children, belongs to an enumerated pair (§14).
      const outcome = outcomes.get(revisionKey(tap, ref))!;
      if (outcome.kind === "failed") throw outcome.error;
      return outcome.revision;
    },
  };
}
