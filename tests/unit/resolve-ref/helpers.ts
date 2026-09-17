/**
 * Shared fixtures for the resolve-ref suites: path-tap configs and a
 * reference builder (§8.3, §8.5).
 */

import type { Config, TapConfig, TapSource } from "../../../src/core/types.ts";

export function pathTap(path: string, name: string): TapConfig {
  return { name, kind: "path", registered: true, url: "", subpath: "", path };
}

export function configWith(...taps: TapConfig[]): Config {
  return {
    taps,
    forced_agents: [],
    disabled_agents: [],
    autoupdate: { enabled: false, interval_seconds: 14400 },
  };
}

export function tapRef(
  tap: string | null,
  namespace: string | null,
  name: string,
  ref: string | null = null,
): TapSource {
  return { type: "tap", tap, namespace, name, ref };
}
