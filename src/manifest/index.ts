/**
 * Project manifest and lockfile (§9.2, §9.3): the entry point for locating,
 * reading, and parsing a project's `.crewrc`, and for the format of the
 * `.crewrc.lock` that records what its git lines resolved to.
 */

export { loadManifestFor, type Manifest, readFileAt } from "./load.ts";
export {
  LOCK_FILENAME,
  type Lock,
  needsLockEntry,
  parseLock,
  pinnedRef,
  serializeLock,
} from "./lock.ts";
export { claimForManifest, isManifestOwned } from "./ownership.ts";
export {
  MANIFEST_FILENAME,
  type ManifestEntry,
  type ManifestInput,
  parseManifest,
} from "./parse.ts";
