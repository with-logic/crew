/**
 * Known-tap configured-state helpers (§16.2.1 / §16.6).
 */

import type { TapConfig } from "../core/types.ts";
import { sameText } from "./text.ts";
import type { KnownTap } from "./types.ts";

export function knownTapIsConfigured(tap: KnownTap, configuredTaps: readonly TapConfig[]): boolean {
  for (const configured of configuredTaps) {
    if (sameText(configured.name, tap.name)) {
      return true;
    }
    if (sameGitSource(configured, tap)) {
      return true;
    }
  }
  return false;
}

function sameGitSource(configured: TapConfig, tap: KnownTap): boolean {
  return (
    configured.kind === "git" &&
    sameText(configured.url, tap.url) &&
    // Case-sensitive: subpaths are filesystem paths inside the repo.
    configured.subpath === tap.subpath
  );
}
