/**
 * Stable aggregate export for crew's domain types (§4, §7, §9, §11).
 *
 * The concrete type groups live in focused sibling modules so each file stays
 * within the project size cap, while existing callers can continue importing
 * from `core/types.ts`.
 */

export type { Marker } from "./marker.ts";
export type { ResolvedSkill } from "./resolved.ts";
export type { Scope } from "./scope.ts";
export type { LoadedSkill, SkillFrontmatter, SkillMetadata } from "./skill.ts";
export type { GitSource, PathSource, Source, SourceKind, TapSource } from "./source.ts";
export type { StateEntry, StateFile, StateSource } from "./state.ts";
export type { Config, TapConfig, TapDiscovery, TapKind } from "./tap.ts";
