/**
 * Skill validation per §9 step 4.
 *
 * Each skill's `SKILL.md` is parsed to frontmatter, then every rule in the
 * Agent Skills specification is checked. An invalid skill throws
 * `invalid_skill` with a message naming the failing field.
 */

import { basename } from "node:path";
import { CrewError } from "../core/errors.ts";
import { NAME_PATTERN } from "../refs/parse.ts";
import type { YamlValue } from "../yaml/parse.ts";
import type { SkillFrontmatter } from "../core/types.ts";

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_COMPATIBILITY_LENGTH = 500;

/**
 * Validate raw frontmatter against the Agent Skills spec.
 *
 * @param data - YAML-decoded frontmatter object.
 * @param skillDir - absolute path to the skill's directory; used to check
 *                   that the frontmatter `name` matches the parent
 *                   directory name per §9 step 4.
 */
export function validateFrontmatter(data: YamlValue, skillDir: string): SkillFrontmatter {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new CrewError("invalid_skill", "frontmatter must be a mapping");
  }
  const map = data as Record<string, YamlValue>;

  // name
  const name = map["name"];
  if (typeof name !== "string" || name.length === 0) {
    throw new CrewError("invalid_skill", "field `name` is required and must be a non-empty string");
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new CrewError("invalid_skill", `field \`name\` exceeds ${MAX_NAME_LENGTH} characters`);
  }
  if (!NAME_PATTERN.test(name)) {
    throw new CrewError("invalid_skill", `field \`name\` must match ${NAME_PATTERN.source}`);
  }
  if (name.endsWith("-")) {
    throw new CrewError("invalid_skill", "field `name` must not end with `-`");
  }
  if (name.includes("--")) {
    throw new CrewError("invalid_skill", "field `name` must not contain `--`");
  }

  // Parent directory must equal name (§9 step 4).
  const dirName = basename(skillDir);
  if (dirName !== name) {
    throw new CrewError("invalid_skill", `field \`name\` (\`${name}\`) does not match parent directory (\`${dirName}\`)`);
  }

  // description
  const description = map["description"];
  if (typeof description !== "string" || description.length === 0) {
    throw new CrewError("invalid_skill", "field `description` is required and must be a non-empty string");
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new CrewError("invalid_skill", `field \`description\` exceeds ${MAX_DESCRIPTION_LENGTH} characters`);
  }

  // license (optional, string if present)
  const license = map["license"];
  if (license !== undefined && license !== null && typeof license !== "string") {
    throw new CrewError("invalid_skill", "field `license` must be a string");
  }

  // compatibility (optional)
  const compatibility = map["compatibility"];
  if (compatibility !== undefined && compatibility !== null) {
    if (typeof compatibility !== "string") {
      throw new CrewError("invalid_skill", "field `compatibility` must be a string");
    }
    if (compatibility.length > MAX_COMPATIBILITY_LENGTH) {
      throw new CrewError("invalid_skill", `field \`compatibility\` exceeds ${MAX_COMPATIBILITY_LENGTH} characters`);
    }
  }

  // metadata.crew (optional)
  let crewMeta: SkillFrontmatter["metadata"] | undefined;
  const metadata = map["metadata"];
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new CrewError("invalid_skill", "field `metadata` must be a mapping");
    }
    const crew = (metadata as Record<string, YamlValue>)["crew"];
    if (crew !== undefined && crew !== null) {
      if (typeof crew !== "object" || Array.isArray(crew)) {
        throw new CrewError("invalid_skill", "field `metadata.crew` must be a mapping");
      }
      const crewMap = crew as Record<string, YamlValue>;
      const homepage = crewMap["homepage"];
      if (homepage !== undefined && homepage !== null && typeof homepage !== "string") {
        throw new CrewError("invalid_skill", "field `metadata.crew.homepage` must be a string");
      }
      const deps = crewMap["dependencies"];
      let depList: readonly string[] | undefined;
      if (deps !== undefined && deps !== null) {
        if (!Array.isArray(deps)) {
          throw new CrewError("invalid_skill", "field `metadata.crew.dependencies` must be a list");
        }
        const parsed: string[] = [];
        for (const entry of deps) {
          if (typeof entry !== "string" || entry.length === 0) {
            throw new CrewError("invalid_skill", "each entry in `metadata.crew.dependencies` must be a non-empty string");
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
          ...(depList !== undefined ? { dependencies: depList } : {}),
        },
      };
    }
  }

  const result: SkillFrontmatter = {
    name,
    description,
    ...(typeof license === "string" ? { license } : {}),
    ...(typeof compatibility === "string" ? { compatibility } : {}),
    ...(crewMeta !== undefined ? { metadata: crewMeta } : {}),
  };
  return result;
}
