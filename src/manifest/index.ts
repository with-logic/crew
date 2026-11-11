/**
 * Project manifest (§9.2): the entry point for locating, reading, and
 * parsing a project's `.crewrc`.
 */

export { findManifest, loadManifest, type Manifest } from "./load.ts";
export {
  MANIFEST_FILENAME,
  type ManifestEntry,
  type ManifestInput,
  parseManifest,
} from "./parse.ts";
