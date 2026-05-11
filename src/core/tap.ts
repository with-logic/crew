/**
 * Tap and config domain types (§6, §16).
 */

export type TapKind = "git" | "path";
export type TapDiscovery = "recursive";

/** A tap configured in config.yaml. */
export interface TapConfig {
  readonly name: string;
  readonly kind: TapKind;
  /** True for user-added taps (`crew tap add`). False for crew-created auto taps. */
  readonly registered: boolean;
  /** For `kind: "git"`: the clone URL. Empty for `kind: "path"`. */
  readonly url: string;
  /** For `kind: "git"`: optional subpath inside the repo. Empty for none / for path taps. */
  readonly subpath: string;
  /** For `kind: "path"`: absolute filesystem path to the tap directory. Empty for git taps. */
  readonly path: string;
  /** Optional non-standard discovery mode. Absent means standard discovery. */
  readonly discovery?: TapDiscovery;
}

/** The parsed, normalized config.yaml. */
export interface Config {
  readonly taps: readonly TapConfig[];
  readonly disabled_agents: readonly string[];
  readonly forced_agents: readonly string[];
  readonly autoupdate: {
    readonly enabled: boolean;
    readonly interval_seconds: number;
  };
}
