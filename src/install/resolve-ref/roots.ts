/**
 * Commit roots for tap/name resolution (§8.3, §9 step 3).
 * Two-segment references can name a namespace in another tap; every
 * candidate must be indexed at the requested ref before choosing it.
 */
import { CrewError } from "../../core/errors.ts";
import type { Config, TapSource } from "../../core/types.ts";
import { withTapsAtRef } from "../../sources/acquire/at-ref.ts";
import { type AcquiredTap, withAcquiredTap } from "../../sources/acquire/index.ts";
import type { TapRoots } from "./types.ts";

export function withResolutionRoots<T>(
  source: Pick<TapSource, "tap" | "namespace" | "ref">,
  config: Config,
  home: string,
  fn: (atRef: Config, roots: TapRoots, acquired: AcquiredTap | null) => T,
): T {
  const ref = source.ref;
  if (ref === null) return fn(config, {}, null);
  const named = config.taps.find((tap) => tap.name === source.tap);
  // Only the three-segment grammar binds one specific tap (§8.3).
  if (source.namespace !== null && named) {
    return withAcquiredTap(named, ref, home, (acquired) =>
      fn(config, { [named.name]: acquired.rootDir }, acquired),
    );
  }
  return withTapsAtRef(config.taps, ref, home, (roots, unavailable) => {
    const atRef = {
      ...config,
      taps: config.taps.filter((tap) => tap.kind === "path" || roots[tap.name] !== undefined),
    };
    try {
      return fn(atRef, roots, null);
    } catch (err) {
      const missingNamed = unavailable.get(source.tap ?? "");
      // Keep the named tap's original ref error if no fallback matched.
      if (err instanceof CrewError && err.code === "invalid_ref" && missingNamed !== undefined)
        throw missingNamed;
      throw err;
    }
  });
}
