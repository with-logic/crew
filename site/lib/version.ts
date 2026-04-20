import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The crew version displayed in the site chrome (Nav, Footer, …).
 *
 * Sourced from `site/public/latest-version.json`, which the release
 * script regenerates on every version bump. Reading it at build time
 * inlines the tag into the static bundle so the site always advertises
 * the latest shipped release.
 */
interface LatestVersion {
  readonly tag_name: string;
}

const raw = readFileSync(join(process.cwd(), "public", "latest-version.json"), "utf8");
const parsed = JSON.parse(raw) as LatestVersion;

export const CREW_VERSION_TAG: string = parsed.tag_name;
