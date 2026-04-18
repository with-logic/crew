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

/** Extract frontmatter from a raw SKILL.md string. Throws `invalid_skill` if malformed. */
export function extractFrontmatter(raw: string): Frontmatter {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  // Skip leading blank lines; `---` must be on the first non-blank line.
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") {
    i++;
  }
  if (i >= lines.length || lines[i]!.trim() !== "---") {
    throw new CrewError("invalid_skill", "SKILL.md is missing YAML frontmatter");
  }
  const start = i + 1;
  let end = -1;
  for (let j = start; j < lines.length; j++) {
    if (lines[j]!.trim() === "---") {
      end = j;
      break;
    }
  }
  if (end < 0) {
    throw new CrewError("invalid_skill", "SKILL.md frontmatter is not terminated");
  }
  const yamlSource = lines.slice(start, end).join("\n");
  let data: YamlValue;
  try {
    data = parseYaml(yamlSource);
  } catch (err) {
    throw new CrewError(
      "invalid_skill",
      `SKILL.md frontmatter is not valid YAML: ${(err as Error).message}`,
    );
  }
  const body = lines.slice(end + 1).join("\n");
  return { data, body };
}
