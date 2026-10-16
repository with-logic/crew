/**
 * Extract and parse SKILL.md frontmatter.
 *
 * Per the Agent Skills spec, every `SKILL.md` begins with a YAML
 * frontmatter block delimited by `---` lines. The rest of the file is the
 * skill body (markdown prose used by the agent).
 */

import { CrewError } from "../core/errors.ts";
import { parseYaml, type YamlValue } from "../yaml/parse.ts";

/** The frontmatter and body of a SKILL.md file. */
export interface Frontmatter {
  /** The YAML frontmatter as a raw object. */
  readonly data: YamlValue;
  /** The markdown body after the frontmatter. */
  readonly body: string;
}

/**
 * True iff `raw` opens with a frontmatter delimiter — exactly the files
 * `extractFrontmatter` gets past its first check. A gist file passing it
 * is a skill candidate (§9 step 5, "Gists").
 */
export function opensFrontmatter(raw: string): boolean {
  return openingDelimiter(linesOf(raw)) >= 0;
}

/** Extract frontmatter from a raw SKILL.md string. Throws `invalid_skill` if malformed. */
export function extractFrontmatter(raw: string): Frontmatter {
  const lines = linesOf(raw);
  const opening = openingDelimiter(lines);
  if (opening < 0) {
    throw new CrewError(
      "invalid_skill",
      "SKILL.md is missing its YAML frontmatter — the first line should be `---`",
    );
  }
  const start = opening + 1;
  let end = -1;
  for (let j = start; j < lines.length; j++) {
    if (lines[j]!.trim() === "---") {
      end = j;
      break;
    }
  }
  if (end < 0) {
    throw new CrewError(
      "invalid_skill",
      "SKILL.md frontmatter never closes — add a `---` line after the last YAML field",
    );
  }
  const yamlSource = lines.slice(start, end).join("\n");
  let data: YamlValue;
  try {
    data = parseYaml(yamlSource);
  } catch (err) {
    throw new CrewError(
      "invalid_skill",
      `SKILL.md frontmatter isn't valid YAML — ${(err as Error).message}`,
    );
  }
  const body = lines.slice(end + 1).join("\n");
  return { data, body };
}

function linesOf(raw: string): string[] {
  return raw.replace(/\r\n?/g, "\n").split("\n");
}

/** Index of the opening `---`, which must be the first non-blank line; -1 when absent. */
function openingDelimiter(lines: readonly string[]): number {
  const first = lines.findIndex((line) => line.trim() !== "");
  return first >= 0 && lines[first]!.trim() === "---" ? first : -1;
}
