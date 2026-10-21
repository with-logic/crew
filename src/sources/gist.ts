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

/** Keep discoveries within one synchronous command, including nested CLI calls. */
export function withGistDiscovery<T>(fn: () => T): T {
  const previous = metadata;
  metadata = new Map();
  try {
    return fn();
  } finally {
    metadata = previous;
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

/** Inspect metadata only; selected files are loaded later while acquisition is live. */
export function gistCandidates(root: string): GistCandidate[] {
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
