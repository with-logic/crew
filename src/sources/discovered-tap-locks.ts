/**
 * Acquire sorted tap locks even when dependency discovery adds taps (§9, §14).
 * Restart discovery with the expanded lock set before touching a new clone;
 * never acquire a new lock out of order while retaining existing locks.
 */

import type { TapConfig } from "../core/types.ts";
import { tapLockTarget, withTapLocks } from "./tap-lock.ts";

class DiscoveredTap {
  readonly tap: TapConfig;
  constructor(tap: TapConfig) {
    this.tap = tap;
  }
}

/** Run discovery/staging with every tap it consults locked. */
export function withDiscoveredTapLocks<T>(
  taps: readonly TapConfig[],
  home: string,
  fn: (requireTap: (tap: TapConfig) => void) => T,
): T {
  const known = new Map(taps.map((tap) => [tapLockTarget(tap, home), tap]));
  const requireTap = (tap: TapConfig): void => {
    if (!known.has(tapLockTarget(tap, home))) throw new DiscoveredTap(tap);
  };
  for (;;) {
    try {
      return withTapLocks([...known.values()], home, () => fn(requireTap));
    } catch (err) {
      if (!(err instanceof DiscoveredTap)) throw err;
      known.set(tapLockTarget(err.tap, home), err.tap);
    }
  }
}
