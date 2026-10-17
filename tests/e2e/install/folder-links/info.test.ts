/**
 * Folder links in `crew info`'s preview (§9 step 5 "Folder links", §9.1;
 * C-SPEC-17): previewing a git source discovers its skills as install
 * does, so a skill folder linked out of the repository is never read or
 * listed, while one linked inside it is.
 */

import { expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/main.ts";
import { captureStreams, makeCrewHome } from "../../../helpers/env.ts";
import { gitRepo, link, outsideSkill, skillAt } from "./helpers.ts";

/** `crew info <source> --json`: its exit code and the skill names it lists. */
function preview(source: string): { code: number; names: string[] } {
  const cap = captureStreams();
  const code = runCli(["info", source, "--json"], { home: makeCrewHome(), streams: cap.streams });
  const body = JSON.parse(cap.stdout()) as { skills?: { name: string }[] };
  return { code, names: (body.skills ?? []).map((s) => s.name).sort() };
}

test("C-SPEC-17 crew info leaves out a skill folder linked out of the repository", () => {
  // Readable, so a preview that followed the link would list it.
  const evil = outsideSkill("evil", true);
  const repo = gitRepo((r) => {
    skillAt(join(r, "skills"), "good");
    skillAt(join(r, "docs"), "inside");
    link(evil, join(r, "skills", "evil"));
    link("../docs/inside", join(r, "skills", "inside"));
  });
  expect(preview(`file://${repo}`)).toEqual({ code: 0, names: ["good", "inside"] });
});
