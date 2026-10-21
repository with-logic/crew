/** GitHub gist layout selection and invocation-scoped metadata discovery (§9 step 5). */

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../core/errors.ts";
import type { SkillFrontmatter, TapConfig } from "../core/types.ts";
import { readFrontmatter } from "../skill/read-frontmatter.ts";
import { validateFrontmatter } from "../skill/validate.ts";
import { readSourceFile } from "../util/source-read.ts";
import { listSourceDirectory } from "./read.ts";

export interface GistCandidate {
  readonly path: string;
  readonly filename: string;
  readonly frontmatter: SkillFrontmatter;
}
interface CachedMetadata {
  readonly signature: string;
  readonly frontmatter: SkillFrontmatter | null;
}
let metadata: Map<string, CachedMetadata> | undefined;
let capturedNames: Map<string, Map<string, GistCandidate[]>> | undefined;

/** Keep discoveries within one synchronous command, including nested CLI calls. */
export function withGistDiscovery<T>(fn: () => T): T {
  const previous = metadata;
  const previousNames = capturedNames;
  metadata = new Map();
  capturedNames = new Map();
  try {
    return fn();
  } finally {
    metadata = previous;
    capturedNames = previousNames;
  }
}

/** Layout depends on the owning tap, never on a filename's current type. */
export function isGistTap(tap: TapConfig): boolean {
  return (
    tap.kind === "git" &&
    /^https?:\/\//i.test(tap.url) &&
    new URL(tap.url).hostname.toLowerCase() === "gist.github.com"
  );
}

/** Inspect metadata only. A named lookup may reuse ONLY an immutable captured root (§9 step 6). */
export function gistCandidates(root: string, capturedName?: string): GistCandidate[] {
  if (capturedName !== undefined) {
    let index = capturedNames?.get(root);
    if (index === undefined) {
      index = new Map();
      for (const candidate of gistCandidates(root)) {
        const name = candidate.frontmatter.name;
        const matches = index.get(name);
        if (matches) matches.push(candidate);
        else index.set(name, [candidate]);
      }
      // Failed discovery never enters the cache; live roots never request a named lookup.
      capturedNames?.set(root, index);
    }
    return index.get(capturedName) ?? [];
  }
  const candidates: GistCandidate[] = [];
  for (const filename of listSourceDirectory(root)) {
    const path = join(root, filename);
    const stat = readSourceFile(path, (file) => lstatSync(file));
    if (!stat.isFile()) continue;
    const signature = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    const hit = metadata?.get(path);
    const frontmatter = hit?.signature === signature ? hit.frontmatter : candidateMetadata(path);
    metadata?.set(path, { signature, frontmatter });
    if (frontmatter !== null) candidates.push({ path, filename, frontmatter });
  }
  return candidates;
}

function candidateMetadata(path: string): SkillFrontmatter | null {
  try {
    return validateFrontmatter(readSourceFile(path, readFrontmatter));
  } catch (err) {
    if (err instanceof CrewError && err.code === "invalid_skill") return null;
    throw err;
  }
}

/** Shared install and preview diagnostic for an empty gist (§9 step 5). */
export function noGistSkillsFound(root: string): CrewError {
  return new CrewError("no_skills_found", `no valid gist skills found at \`${root}\``);
}
