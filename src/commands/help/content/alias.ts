/**
 * Alias help-page construction (§5.1, §5.5).
 *
 * An alias accepts exactly the flags its canonical command accepts,
 * because `src/cli/args.ts` resolves the alias before consulting the
 * flag tables. Hand-copying those lists is how they drifted: `remove`
 * and `rm` listed two of uninstall's four flags. `aliasHelp` derives
 * the `flags` array from the canonical entry instead, so a flag added
 * to a canonical page appears on every alias of it automatically.
 *
 * Prefixed aliases (`taps` → `tap list`) are NOT built with this
 * helper: they name one subcommand and accept only that subcommand's
 * flags, so they declare their own narrower list.
 */

import type { CommandHelp } from "./types.ts";

/** Everything an alias page declares for itself; `flags` come from the canonical page. */
export interface AliasHelpSpec {
  readonly name: string;
  readonly synopsis: string;
  readonly summary: readonly string[];
  readonly examples?: readonly { readonly command: string; readonly description: string }[];
  readonly seeAlso?: readonly string[];
  readonly notes?: readonly string[];
}

/** Build an alias help page that inherits `canonical`'s flag list verbatim. */
export function aliasHelp(spec: AliasHelpSpec, canonical: CommandHelp): CommandHelp {
  return {
    name: spec.name,
    synopsis: spec.synopsis,
    summary: spec.summary,
    ...(canonical.flags === undefined ? {} : { flags: canonical.flags }),
    ...(spec.examples === undefined ? {} : { examples: spec.examples }),
    ...(spec.seeAlso === undefined ? {} : { seeAlso: spec.seeAlso }),
    ...(spec.notes === undefined ? {} : { notes: spec.notes }),
  };
}
