/** Distinguish an absent directory manifest from invalid contents without changing its error (§9, §10.1). */

import { CrewError } from "../core/errors.ts";

export class MissingSkillManifestError extends CrewError {
  constructor(skillDirectory: string) {
    super(
      "invalid_skill",
      `no SKILL.md in \`${skillDirectory}\` — every skill directory needs one`,
      { path: skillDirectory },
    );
  }
}
