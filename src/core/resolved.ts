/**
 * Resolved install-pipeline skill type (§9).
 */

import type { SkillFrontmatter } from "./skill.ts";
import type { TapConfig } from "./tap.ts";

/** A resolved skill ready to be installed: materialized contents and identity. */
export interface ResolvedSkill {
  /** Absolute path to the content in the store. */
  readonly storePath: string;
  /** The frontmatter name. */
  readonly name: string;
  /** Loaded frontmatter for dependency walking. */
  readonly frontmatter: SkillFrontmatter;
  /** Tap that owns this skill (the marker carries the full tap descriptor). */
  readonly tap: TapConfig;
  /** Skill location relative to the tap's root. */
  readonly tapRelativePath: string;
  /** The ref the user asked for. */
  readonly ref: string | null;
  /** Full 40-char SHA, or null for path-kind taps. */
  readonly resolvedSha: string | null;
  /** Whether the install counts as pinned (SHA or tag). */
  readonly pinned: boolean;
  /** Content hash of the store entry. */
  readonly contentHash: string;
  /** True if this skill was named on the command line or via a tap-name install. */
  readonly explicit: boolean;
  /** True when this skill came from a whole-tap install. */
  readonly tracksTap: boolean;
}
