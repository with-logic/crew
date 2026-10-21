/** Require an explicitly selected gist source to remain a regular file (§9 step 4). */
import { lstatSync } from "node:fs";
import { CrewError } from "../core/errors.ts";
import { readSourceFile } from "../util/source-read.ts";

export function assertSkillFile(path: string): void {
  const stat = readSourceFile(path, (file) => lstatSync(file, { throwIfNoEntry: false }));
  if (!stat)
    throw new CrewError("no_skills_found", `gist file \`${path}\` no longer exists`, { path });
  if (!stat.isFile())
    throw new CrewError("invalid_skill", `gist skill \`${path}\` must be a regular file`, { path });
}
