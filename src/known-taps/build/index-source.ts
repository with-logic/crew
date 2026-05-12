/**
 * Index one pinned known-tap source for the bundled registry (§16.2.1).
 */

import { join, relative } from "node:path";
import type { LoadedSkill } from "../../core/types.ts";
import { checkoutSha, cloneRepo } from "../../git/repo.ts";
import { hasSkillMd } from "../../skill/load.ts";
import { expandSkills } from "../../sources/expand.ts";
import { toPosix } from "../../util/fs.ts";
import type { KnownTap, KnownTapSkill } from "../types.ts";
import type { KnownTapSource } from "./types.ts";

export function indexKnownTapSource(source: KnownTapSource, clonePath: string): KnownTap {
  cloneRepo(source.url, clonePath, true);
  checkoutSha(clonePath, source.commit);
  assertDisplaySafeSource(source, clonePath);
  const root = source.subpath.length > 0 ? join(clonePath, source.subpath) : clonePath;
  const expanded = expandSkills(root);
  if (expanded.skipped.length > 0) {
    const first = expanded.skipped[0]!;
    throw new Error(`known tap \`${source.name}\` has an invalid skill: ${first.message}`);
  }
  const skills = expanded.valid.map((skill) => knownTapSkill(root, skill));
  skills.sort(compareKnownTapSkills);
  return {
    name: source.name,
    url: source.url,
    subpath: source.subpath,
    description: source.description,
    trust: source.trust,
    skills,
  };
}

function assertDisplaySafeSource(source: KnownTapSource, clonePath: string): void {
  if (source.subpath !== "skills") return;
  if (!hasSkillMd(clonePath)) return;
  throw new Error(
    `known tap \`${source.name}\` uses subpath \`skills\` but repo root also has a SKILL.md; use an explicit sourceRef before shortening display commands`,
  );
}

function knownTapSkill(root: string, skill: LoadedSkill): KnownTapSkill {
  const path = toPosix(relative(root, skill.path));
  return {
    name: skill.frontmatter.name,
    namespace: namespaceFor(path),
    description: skill.frontmatter.description,
    path,
  };
}

function namespaceFor(path: string): string | null {
  const parts = path.split("/");
  if (parts.length === 3 && parts[0] === "skills") return parts[1]!;
  return null;
}

function compareKnownTapSkills(a: KnownTapSkill, b: KnownTapSkill): number {
  if (a.namespace !== b.namespace) return (a.namespace ?? "").localeCompare(b.namespace ?? "");
  return a.name.localeCompare(b.name);
}
