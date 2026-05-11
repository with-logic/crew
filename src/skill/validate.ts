/**
 * Skill validation per §9 step 4.
 *
 * Each skill's `SKILL.md` is parsed to frontmatter, then every rule in the
 * Agent Skills specification is checked. An invalid skill throws
 * `invalid_skill` with a message naming the failing field.
 */

import { CrewError } from "../core/errors.ts";
import type { SkillFrontmatter } from "../core/types.ts";
import { NAME_PATTERN } from "../refs/parse.ts";
import type { YamlValue } from "../yaml/parse.ts";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_COMPATIBILITY_LENGTH = 500;

/**
 * Validate raw frontmatter against the Agent Skills spec.
 * Delegates name-only checks to `validateFrontmatterName`.
 *
 * @param data - YAML-decoded frontmatter object.
 */
export function validateFrontmatter(data: YamlValue): SkillFrontmatter {
  const name = validateFrontmatterName(data);
  const map = data as Record<string, YamlValue>;

  // description
  const description = map["description"];
  if (typeof description !== "string" || description.length === 0) {
    throw new CrewError(
      "invalid_skill",
      "SKILL.md frontmatter is missing `description` — add a non-empty one-line summary the agent will read to decide whether to use this skill",
    );
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new CrewError(
      "invalid_skill",
      `\`description\` is ${description.length} characters; max is ${MAX_DESCRIPTION_LENGTH}`,
    );
  }

  // license (optional, string if present)
  const license = map["license"];
  if (license !== undefined && license !== null && typeof license !== "string") {
    throw new CrewError("invalid_skill", "`license` must be a string (e.g. `license: MIT`)");
  }

  // compatibility (optional)
  const compatibility = map["compatibility"];
  if (compatibility !== undefined && compatibility !== null) {
    if (typeof compatibility !== "string") {
      throw new CrewError("invalid_skill", "`compatibility` must be a string if present");
    }
    if (compatibility.length > MAX_COMPATIBILITY_LENGTH) {
      throw new CrewError(
        "invalid_skill",
        `\`compatibility\` is ${compatibility.length} characters; max is ${MAX_COMPATIBILITY_LENGTH}`,
      );
    }
  }

  // metadata.crew (optional)
  let crewMeta: SkillFrontmatter["metadata"] | undefined;
  const metadata = map["metadata"];
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new CrewError(
        "invalid_skill",
        "`metadata` must be a YAML mapping if present (nested `key: value` pairs)",
      );
    }
    const crew = (metadata as Record<string, YamlValue>)["crew"];
    if (crew !== undefined && crew !== null) {
      if (typeof crew !== "object" || Array.isArray(crew)) {
        throw new CrewError("invalid_skill", "`metadata.crew` must be a YAML mapping if present");
      }
      const crewMap = crew as Record<string, YamlValue>;
      const homepage = crewMap["homepage"];
      if (homepage !== undefined && homepage !== null && typeof homepage !== "string") {
        throw new CrewError(
          "invalid_skill",
          "`metadata.crew.homepage` must be a URL string (e.g. `homepage: https://...`)",
        );
      }
      const deps = crewMap["dependencies"];
      let depList: readonly string[] | undefined;
      if (deps !== undefined && deps !== null) {
        if (!Array.isArray(deps)) {
          throw new CrewError(
            "invalid_skill",
            "`metadata.crew.dependencies` must be a YAML list of skill references",
          );
        }
        const parsed: string[] = [];
        for (const entry of deps) {
          if (typeof entry !== "string" || entry.length === 0) {
            throw new CrewError(
              "invalid_skill",
              "each `metadata.crew.dependencies` entry must be a non-empty skill reference string",
            );
          }
          parsed.push(entry);
        }
        depList = parsed;
      }
      crewMeta = {
        metadata: undefined as never, // shape detail only
      } as unknown as SkillFrontmatter["metadata"];
      // Construct the nested metadata cleanly:
      crewMeta = {
        crew: {
          ...(typeof homepage === "string" ? { homepage } : {}),
          ...(depList === undefined ? {} : { dependencies: depList }),
        },
      };
    }
  }

  const result: SkillFrontmatter = {
    name,
    description,
    ...(typeof license === "string" ? { license } : {}),
    ...(typeof compatibility === "string" ? { compatibility } : {}),
    ...(crewMeta === undefined ? {} : { metadata: crewMeta }),
  };
  return result;
}

/** Validate and return only the declared skill name from SKILL.md frontmatter. */
export function validateFrontmatterName(data: YamlValue): string {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new CrewError(
      "invalid_skill",
      "SKILL.md frontmatter must be a YAML mapping (`key: value` pairs), not a scalar or list",
    );
  }
  const map = data as Record<string, YamlValue>;

  // name
  const name = map["name"];
  if (typeof name !== "string" || name.length === 0) {
    throw new CrewError(
      "invalid_skill",
      "SKILL.md frontmatter is missing `name` — add a non-empty string, e.g. `name: my-skill`",
    );
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new CrewError(
      "invalid_skill",
      `\`name\` is ${name.length} characters; max is ${MAX_NAME_LENGTH}`,
    );
  }
  if (!NAME_PATTERN.test(name)) {
    throw new CrewError(
      "invalid_skill",
      `\`name: ${name}\` has invalid characters — use lowercase letters, digits, and hyphens only, starting with an alphanumeric, not a hyphen`,
    );
  }
  if (name.endsWith("-")) {
    throw new CrewError(
      "invalid_skill",
      `\`name: ${name}\` ends with a hyphen — drop the trailing \`-\``,
    );
  }
  if (name.includes("--")) {
    throw new CrewError(
      "invalid_skill",
      `\`name: ${name}\` contains \`--\` — collapse consecutive hyphens to single ones`,
    );
  }
  return name;
}
