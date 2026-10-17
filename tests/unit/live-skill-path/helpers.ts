/**
 * Fixtures for the `liveSkillPath` tests (§8.4, §10.1): a git tap and a
 * hand-laid clone of it, so link and permission shapes are exact.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CrewError } from "../../../src/core/errors.ts";
import { tapClonePath } from "../../../src/core/repo-path.ts";
import type { TapConfig } from "../../../src/core/types.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

export const TAP: TapConfig = {
  name: "acme",
  kind: "git",
  registered: true,
  url: "https://example.com/acme/skills.git",
  subpath: "",
  path: "",
};

/** A clone of `TAP` under a fresh home, holding `skills/`. */
export function clone(): { home: string; root: string; skills: string } {
  const home = makeTempDir("crew-live-");
  const root = tapClonePath(TAP, home);
  const skills = join(root, "skills");
  mkdirSync(skills, { recursive: true });
  return { home, root, skills };
}

/** What `fn` throws; a test reading its `code` fails if `fn` returned. */
export function failure(fn: () => unknown): CrewError {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  return thrown as CrewError;
}
