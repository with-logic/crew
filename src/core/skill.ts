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

/** Validated identity at a skill directory or original gist filename (§9). */
export interface SkillMetadata {
  /** Absolute path to the skill directory or original gist file. */
  readonly path: string;
  /** Parsed frontmatter. */
  readonly frontmatter: SkillFrontmatter;
}

/** Full source content; gist filenames are preserved until staging as SKILL.md (§9). */
export interface LoadedSkill extends SkillMetadata {
  /** Raw manifest content from SKILL.md or the original gist filename. */
  readonly skillMd: string;
}
