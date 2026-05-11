/**
 * Pin-refresh helpers for known-tap registry sources (§16.2.1).
 */

import { type GitRunner, runGit } from "../../git/exec.ts";
import { isFullSha } from "./sha.ts";
import type { KnownTapManifest, KnownTapSource } from "./types.ts";

export interface PinUpdate {
  readonly name: string;
  readonly trackingRef: string;
  readonly from: string;
  readonly to: string;
}

export interface PinUpdateResult {
  readonly manifest: KnownTapManifest;
  readonly updates: readonly PinUpdate[];
}

export function updateKnownTapPins(
  manifest: KnownTapManifest,
  selection: "all" | readonly string[],
  runner: GitRunner = runGit,
): PinUpdateResult {
  const selected = selectedNames(manifest, selection);
  const updates: PinUpdate[] = [];
  const taps: KnownTapSource[] = [];
  for (const source of manifest.taps) {
    if (!selected.has(source.name)) {
      taps.push(source);
      continue;
    }
    const trackingRef = trackingRefFor(source);
    const next = resolveTrackingRef(source.url, trackingRef, runner);
    taps.push({ ...source, commit: next });
    updates.push({ name: source.name, trackingRef, from: source.commit, to: next });
  }
  return { manifest: { version: 1, taps }, updates };
}

export function resolveTrackingRef(url: string, trackingRef: string, runner: GitRunner): string {
  if (isFullSha(trackingRef)) return trackingRef;
  for (const candidate of refCandidates(trackingRef)) {
    const result = runner(["ls-remote", url, candidate], { throwOnError: false });
    if (result.exitCode !== 0) {
      throw new Error(`couldn't resolve \`${trackingRef}\` from ${url}: ${result.stderr.trim()}`);
    }
    const sha = parseLsRemoteSha(result.stdout);
    if (sha !== null) return sha;
  }
  throw new Error(`couldn't find tracking ref \`${trackingRef}\` in ${url}`);
}

function selectedNames(
  manifest: KnownTapManifest,
  selection: "all" | readonly string[],
): Set<string> {
  if (selection === "all") {
    return new Set(
      manifest.taps.filter((tap) => tap.trackingRef !== undefined).map((tap) => tap.name),
    );
  }
  const available = new Set(manifest.taps.map((tap) => tap.name));
  for (const name of selection) {
    if (!available.has(name)) throw new Error(`unknown known tap \`${name}\``);
  }
  return new Set(selection);
}

function trackingRefFor(source: KnownTapSource): string {
  if (source.trackingRef !== undefined) return source.trackingRef;
  throw new Error(`known tap \`${source.name}\` has no trackingRef to refresh`);
}

function refCandidates(ref: string): readonly string[] {
  if (ref.startsWith("refs/tags/")) return [`${ref}^{}`, ref];
  if (ref.startsWith("refs/")) return [ref];
  return [`refs/heads/${ref}`, `refs/tags/${ref}^{}`, `refs/tags/${ref}`, ref];
}

function parseLsRemoteSha(stdout: string): string | null {
  for (const line of stdout.split("\n")) {
    const [sha] = line.split("\t", 1);
    if (sha !== undefined && isFullSha(sha)) return sha;
  }
  return null;
}
