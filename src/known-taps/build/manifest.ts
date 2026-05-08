/**
 * Manifest parsing for known-tap registry builds (§16.2.1).
 */

import { NAME_PATTERN } from "../../refs/parse.ts";
import type { KnownTapTrust } from "../types.ts";
import { assertRelativePosixPath } from "./paths.ts";
import { isFullSha } from "./sha.ts";
import type { KnownTapManifest, KnownTapSource } from "./types.ts";

export function parseKnownTapManifest(value: unknown): KnownTapManifest {
  const root = asRecord(value, "manifest");
  if (root["version"] !== 1) throw new Error("known-tap manifest version must be 1");
  const rawTaps = root["taps"];
  if (!Array.isArray(rawTaps)) throw new Error("known-tap manifest taps must be an array");
  const taps: KnownTapSource[] = [];
  const names = new Set<string>();
  for (const rawTap of rawTaps) {
    const source = parseKnownTapSource(rawTap);
    if (names.has(source.name)) throw new Error(`duplicate known tap name \`${source.name}\``);
    names.add(source.name);
    taps.push(source);
  }
  return { version: 1, taps };
}

function parseKnownTapSource(value: unknown): KnownTapSource {
  const tap = asRecord(value, "known tap");
  const name = stringField(tap, "name");
  const source: KnownTapSource = {
    name,
    url: stringField(tap, "url"),
    subpath: subpathField(tap),
    description: stringField(tap, "description"),
    trust: trustField(tap),
    commit: commitField(tap),
    ...optionalTrackingRef(tap),
  };
  validateSource(source);
  return source;
}

function validateSource(source: KnownTapSource): void {
  if (!NAME_PATTERN.test(source.name)) {
    throw new Error(`known tap name \`${source.name}\` must match crew's name grammar`);
  }
  assertRelativePosixPath(source.subpath, `${source.name}.subpath`, true);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error(`${label} must be an object`);
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`known tap field \`${field}\` must be a non-empty string`);
}

function subpathField(record: Record<string, unknown>): string {
  const value = record["subpath"];
  if (typeof value === "string") return value;
  throw new Error("known tap field `subpath` must be a string");
}

function trustField(record: Record<string, unknown>): KnownTapTrust {
  const trust = stringField(record, "trust");
  if (trust === "official" || trust === "curated") return trust;
  throw new Error("known tap field `trust` must be `official` or `curated`");
}

function commitField(record: Record<string, unknown>): string {
  const commit = stringField(record, "commit");
  if (isFullSha(commit)) return commit;
  throw new Error("known tap field `commit` must be a lowercase 40-character SHA");
}

function optionalTrackingRef(record: Record<string, unknown>): { readonly trackingRef?: string } {
  const value = record["trackingRef"];
  if (value === undefined) return {};
  if (typeof value === "string" && value.length > 0) return { trackingRef: value };
  throw new Error("known tap field `trackingRef`, when present, must be a non-empty string");
}
