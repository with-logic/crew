/**
 * Shared types for one command's help entry. Imported by every
 * per-command file under `help-entries/` and by `help-content.ts`.
 */

/** A free-form extra section: heading plus a mix of prose lines and literal blocks. */
export interface HelpSection {
  /** Section heading (rendered in uppercase, no trailing colon — matches USAGE/FLAGS/etc.). */
  readonly heading: string;
  /**
   * Body lines. Strings are word-wrapped prose. Objects with `literal: true`
   * are rendered verbatim (preserving indentation, line breaks) — use for
   * code snippets, YAML fragments, directory trees.
   */
  readonly body: readonly (
    | string
    | { readonly literal: true; readonly lines: readonly string[] }
  )[];
}

/** Structured help for one command. Rendered by `renderCommand`. */
export interface CommandHelp {
  /** Command name as typed. */
  readonly name: string;
  /** Single-line usage synopsis. */
  readonly synopsis: string;
  /** One to three lines of prose — what the command does, why you'd reach for it. */
  readonly summary: readonly string[];
  /** Flags that are meaningful for this command (global flags omitted unless relevant). */
  readonly flags?: readonly { readonly flag: string; readonly description: string }[];
  /** Concrete example invocations with a one-line gloss. */
  readonly examples?: readonly { readonly command: string; readonly description: string }[];
  /** Related commands the user might want next. */
  readonly seeAlso?: readonly string[];
  /** Optional "NOTES" section — gotchas, spec pointers, platform caveats. */
  readonly notes?: readonly string[];
  /**
   * Optional extra sections rendered before NOTES. Use for guides that
   * don't fit a single NOTES bullet — tap authoring, skill structure, etc.
   */
  readonly sections?: readonly HelpSection[];
}
