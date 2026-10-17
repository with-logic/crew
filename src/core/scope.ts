/**
 * Install-scope domain type (§5.2, §7.4).
 */

/** Every install scope, for checks of a value read from disk. */
export const SCOPES = ["user", "project"] as const;

/** Install scope: user-wide or project-local. */
export type Scope = (typeof SCOPES)[number];
