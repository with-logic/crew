/**
 * Built-in defaults for the crew configuration.
 *
 * §6.1 says: "Missing fields take their defaults." Rather than sprinkle
 * defaults throughout the codebase, every read of `config.yaml` goes
 * through `normalizeConfig` (in ./load.ts) which fills in these values.
 */

import type { Config } from "../core/types.ts";

/** The name of the default tap. Fixed by §16.2. */
export const DEFAULT_TAP_NAME = "core";

/** URL of the default tap. Kept here so §19 item 1 has one place to update. */
export const DEFAULT_TAP_URL = "https://github.com/crew-sh/core.git";

/** The default autoupdate interval (4 hours in seconds) per §10.2. */
export const DEFAULT_AUTOUPDATE_INTERVAL_SECONDS = 14400;

/** The shape of the config when none exists. */
export function defaultConfig(): Config {
  return {
    taps: [
      {
        name: DEFAULT_TAP_NAME,
        kind: "git",
        registered: true,
        url: DEFAULT_TAP_URL,
        subpath: "",
        path: "",
      },
    ],
    disabled_agents: [],
    forced_agents: [],
    autoupdate: {
      enabled: false,
      interval_seconds: DEFAULT_AUTOUPDATE_INTERVAL_SECONDS,
    },
  };
}
