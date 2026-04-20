/**
 * Version metadata for the crew implementation.
 *
 * Kept in its own module so the build can be configured to substitute it
 * without touching anything else. The value written to the `installed_by`
 * marker field and printed by `crew version` is derived from here.
 */
export const CREW_VERSION = "0.4.0";
export const CREW_INSTALLED_BY = `crew/${CREW_VERSION}`;
