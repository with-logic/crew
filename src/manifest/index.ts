/**
 * Project manifest (§9.2): the entry point for locating, reading, and
 * parsing a project's `.crewrc`.
 */

export { loadManifestFor, type Manifest } from "./load.ts";
export {
  isLockable,
  LOCK_FILENAME,
  type Lock,
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
