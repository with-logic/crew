/**
 * Shared fixtures for the SKILL.md link tests (§9 step 4; C-SPEC-15).
 */

import { renameSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/main.ts";
import { captureStreams } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";

/** `crew install <source>`; its exit code and output, collapsed to one line. */
export function install(home: string, source: string): { code: number; out: string } {
  const cap = captureStreams();
  const code = runCli(["install", source], { home, streams: cap.streams });
  // Collapse the renderer's line wrapping so messages match as one line.
  return { code, out: (cap.stdout() + cap.stderr()).replace(/\s+/g, " ") };
}

/** A source holding `good` and a `linked` skill whose SKILL.md is `link(folder)`. */
export function sourceWithLink(link: (folder: string) => string): string {
  const src = makeTempDir();
  makeSkill(src, "good", skillFrontmatter({ name: "good" }));
  makeSkill(src, "linked", skillFrontmatter({ name: "linked" }));
  const folder = join(src, "linked");
  renameSync(join(folder, "SKILL.md"), join(folder, "body.md"));
  symlinkSync(link(folder), join(folder, "SKILL.md"));
  return src;
}
