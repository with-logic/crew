/**
 * Generated site catalog file IO for known-tap maintenance (§16.2.1).
 */

import { join } from "node:path";
import { DEFAULT_TAP_NAME, DEFAULT_TAP_URL } from "../../src/config/defaults.ts";
import { runGit } from "../../src/git/exec.ts";
import { indexKnownTapSource } from "../../src/known-taps/build/index-source.ts";
import { resolveTrackingRef } from "../../src/known-taps/build/pins.ts";
import type { KnownTapSource } from "../../src/known-taps/build/types.ts";
import { knownTapSource } from "../../src/known-taps/format.ts";
import type { KnownTap } from "../../src/known-taps/types.ts";
import { readText, writeText } from "../../src/util/fs.ts";

const DEFAULT_TAP_TRACKING_REF = "main";
const DEFAULT_TAP_DESCRIPTION =
  "The default Homecrew tap maintained by Logic with starter skills for agent workflows.";

export function renderSiteCatalog(taps: readonly SiteCatalogTap[]): string {
  return `/**
 * Generated site skill catalog data.
 *
 * Do not edit by hand. Run \`bun run known-taps build\` after changing the
 * known-tap manifest or default tap contents.
 */

export interface SkillCatalogSkill {
  readonly name: string;
  readonly namespace: string | null;
  readonly description: string;
}

export interface SkillCatalogTap {
  readonly name: string;
  readonly source: "default" | "known";
  readonly url: string;
  readonly subpath: string;
  readonly sourceRef: string;
  readonly description: string;
  readonly trust: "official" | "curated";
  readonly skills: readonly SkillCatalogSkill[];
}

// biome-ignore format: generated compact catalog data stays one line to keep this file navigable.
export const SKILL_CATALOG_TAPS = ${JSON.stringify(taps)} as const satisfies readonly SkillCatalogTap[];
`;
}

export function writeSiteCatalog(path: string, taps: readonly KnownTap[], workDir: string): void {
  writeText(path, renderSiteCatalog(siteCatalogTaps(taps, workDir)));
}

export function checkSiteCatalog(path: string, taps: readonly KnownTap[], workDir: string): void {
  const expected = renderSiteCatalog(siteCatalogTaps(taps, workDir));
  if (readText(path) !== expected) {
    throw new Error(`site skill catalog is stale in ${path}; run \`bun run known-taps build\``);
  }
}

type SiteCatalogTap = ReturnType<typeof catalogTap>;

function siteCatalogTaps(taps: readonly KnownTap[], workDir: string): readonly SiteCatalogTap[] {
  return [defaultTap(workDir), ...taps.map((tap) => catalogTap(tap, "known"))];
}

function defaultTap(workDir: string): SiteCatalogTap {
  return catalogTap(
    indexKnownTapSource(defaultTapSource(), join(workDir, "__site_core")),
    "default",
  );
}

function defaultTapSource(): KnownTapSource {
  // The site catalog includes `core`, but `core` is the configured default tap,
  // not a known-but-untapped manifest entry. Follow its default branch whenever
  // the generated catalog is rebuilt so releases pick up newly-reviewed core
  // skills without a separate manifest-pin PR.
  const commit = resolveTrackingRef(DEFAULT_TAP_URL, DEFAULT_TAP_TRACKING_REF, runGit);
  return {
    name: DEFAULT_TAP_NAME,
    url: DEFAULT_TAP_URL,
    subpath: "",
    description: DEFAULT_TAP_DESCRIPTION,
    trust: "official",
    commit,
    trackingRef: DEFAULT_TAP_TRACKING_REF,
  };
}

function catalogTap(tap: KnownTap, source: "default" | "known") {
  return {
    name: tap.name,
    source,
    url: tap.url,
    subpath: tap.subpath,
    sourceRef: knownTapSource(tap),
    description: tap.description,
    trust: tap.trust,
    skills: tap.skills.map((skill) => ({
      name: skill.name,
      namespace: skill.namespace,
      description: skill.description,
    })),
  };
}
