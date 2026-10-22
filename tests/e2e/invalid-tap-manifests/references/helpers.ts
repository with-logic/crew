/** Offline final-reference-miss fixtures (§8.3, §9; C-TAP-08e). */

import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../../src/config/load.ts";
import type { TapConfig } from "../../../../src/core/types.ts";
import { captureStreams, makeCrewHome } from "../../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../../helpers/fixtures.ts";

export function pathTap(path: string, name = "local"): TapConfig {
  return { name, kind: "path", registered: true, path, url: "", subpath: "" };
}

export function referenceFixture() {
  const home = makeCrewHome();
  const root = makeTempDir("crew-miss-tap-");
  const cwd = makeTempDir("crew-miss-cwd-");
  const configure = (taps: readonly TapConfig[]) => {
    writeConfig({ ...readConfig(home), taps }, home);
  };
  configure([pathTap(root)]);
  return {
    home,
    root,
    cwd,
    configure,
    invoke(ref: string, args: readonly string[] = [], command = "install") {
      const c = captureStreams();
      const code = runCli([command, ref, ...args], {
        home,
        cwd,
        streams: c.streams,
        promptChoice: () => "abort",
      });
      return { code, out: c.stdout(), err: c.stderr() };
    },
  };
}

export function rejectedLayout(root: string) {
  const skills = join(root, "skills");
  const bad = makeSkill(skills, "bad", "name: BAD_NAME\ndescription: Invalid name");
  const malformed = makeSkill(join(skills, "marketing"), "broken", "name: [broken");
  const other = makeSkill(join(skills, "sales"), "bad", "name: OTHER_BAD");
  const linked = join(skills, "linked");
  mkdirSync(linked);
  symlinkSync(join(bad, "SKILL.md"), join(linked, "SKILL.md"));
  makeSkill(skills, "healthy", skillFrontmatter({ name: "healthy" }));
  return { bad, malformed, other, linked };
}
