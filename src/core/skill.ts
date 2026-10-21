/**
 * Agent Skill manifest types (§4).
 */

/** Frontmatter fields crew cares about from SKILL.md. */
export interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly license?: string;
  readonly compatibility?: string;
  readonly metadata?: {
    readonly crew?: {
      readonly homepage?: string;
      readonly dependencies?: readonly string[];
    };
  };
}

/** A skill on disk: its source path, parsed frontmatter, and raw manifest (§9). */
export interface LoadedSkill {
  /** Absolute directory path, or original file path for a gist skill. */
  readonly path: string;
  /** Parsed frontmatter. */
  readonly frontmatter: SkillFrontmatter;
  /** Raw SKILL.md bytes. */
  readonly skillMd: string;
}
