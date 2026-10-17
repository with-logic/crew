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

/**
 * A skill on disk: where it is, and its parsed frontmatter. Its SKILL.md
 * text isn't kept: nothing after validation reads it, and a resolution may
 * hold many skills at once (staging copies the files, §9 step 8).
 */
export interface LoadedSkill {
  /** Absolute path to the skill's directory — or, for a gist skill, its file (§9 step 5). */
  readonly path: string;
  /** Parsed frontmatter. */
  readonly frontmatter: SkillFrontmatter;
}
