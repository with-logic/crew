/**
 * Extract and parse SKILL.md frontmatter (§9 step 4).
 *
 * Per the Agent Skills spec, every `SKILL.md` begins with a YAML
 * frontmatter block delimited by `---` lines. The rest of the file is the
 * skill body (markdown prose used by the agent).
 */

import { CrewError } from "../core/errors.ts";
import { parseYaml, type YamlValue } from "../yaml/parse.ts";
import { FrontmatterDelimiters } from "./delimiters.ts";

/** The frontmatter and body of a SKILL.md file. */
export interface Frontmatter {
  /** The YAML frontmatter as a raw object. */
  readonly data: YamlValue;
  /** The markdown body after the frontmatter. */
  readonly body: string;
}

/** Extract frontmatter from a raw SKILL.md string. Throws `invalid_skill` if malformed. */
export function extractFrontmatter(raw: string): Frontmatter {
  const scan = new FrontmatterDelimiters();
  scan.write(raw);
  if (scan.kind === "pending") scan.end();
  if (scan.kind === "missing") {
    throw new CrewError(
      "invalid_skill",
      "SKILL.md is missing its YAML frontmatter — the first line should be `---`",
    );
  }
  if (scan.kind === "unclosed") {
    throw new CrewError(
      "invalid_skill",
      "SKILL.md frontmatter never closes — add a `---` line after the last YAML field",
    );
  }
  const yamlSource = raw.slice(scan.headerStart, scan.headerEnd).replace(/\r\n?/g, "\n");
  let data: YamlValue;
  try {
    data = parseYaml(yamlSource);
  } catch (err) {
    throw new CrewError(
      "invalid_skill",
      `SKILL.md frontmatter isn't valid YAML — ${(err as Error).message}`,
    );
  }
  const bodyStart =
    scan.bodyStart + (raw[scan.bodyStart - 1] === "\r" && raw[scan.bodyStart] === "\n" ? 1 : 0);
  const body = raw.slice(bodyStart).replace(/\r\n?/g, "\n");
  return { data, body };
}
