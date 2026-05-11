/**
 * Add-source helpers for the known-tap registry manifest (§16.2.1).
 */

import { type GitRunner, runGit } from "../../git/exec.ts";
import type { KnownTapTrust } from "../types.ts";
import { parseKnownTapManifest } from "./manifest.ts";
import { resolveTrackingRef } from "./pins.ts";
import type { KnownTapManifest, KnownTapSource } from "./types.ts";

export interface AddKnownTapOptions {
  readonly name: string;
  readonly url: string;
  readonly subpath?: string;
  readonly description?: string;
  readonly trust?: KnownTapTrust;
  readonly trackingRef?: string;
}

export interface AddKnownTapResult {
  readonly manifest: KnownTapManifest;
  readonly source: KnownTapSource;
}

export function addKnownTapSource(
  manifest: KnownTapManifest,
  options: AddKnownTapOptions,
  runner: GitRunner = runGit,
): AddKnownTapResult {
  if (manifest.taps.some((tap) => tap.name === options.name)) {
    throw new Error(`known tap \`${options.name}\` already exists`);
  }

  const trackingRef = options.trackingRef ?? "main";
  const commit = resolveTrackingRef(options.url, trackingRef, runner);
  const source = parseKnownTapManifest({
    version: 1,
    taps: [
      {
        name: options.name,
        url: options.url,
        subpath: options.subpath ?? "",
        description: options.description ?? `${options.name} skills.`,
        trust: options.trust ?? "curated",
        commit,
        trackingRef,
      },
    ],
  }).taps[0]!;

  const taps = [...manifest.taps, source].sort((a, b) => a.name.localeCompare(b.name));
  return { manifest: { version: 1, taps }, source };
}
