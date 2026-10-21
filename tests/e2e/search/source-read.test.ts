/** Source-read search warnings escape configured tap labels (§5.2, §16.6). */

import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

test("human source-read warnings escape control characters in configured tap names", () => {
  const home = makeCrewHome();
  const root = makeTempDir("crew-search-warning-controls-");
  const skill = makeSkill(root, "demo", skillFrontmatter({ name: "demo" }));
  const name = "local\nforged\x1b[31m\x7f\x85\x9b";
  writeConfig(
    {
      ...readConfig(home),
      taps: [{ name, kind: "path", registered: true, path: root, url: "", subpath: "" }],
    },
    home,
  );
  const manifest = join(skill, "SKILL.md");
  chmodSync(manifest, 0);
  try {
    const capture = captureStreams();
    expect(runCli(["search", "--tap", name], { home, streams: capture.streams })).toBe(0);
    const warning = capture.stderr();
    expect(warning).toContain(
      "warning: tap `local\\x0aforged\\x1b[31m\\x7f\\x85\\x9b` skipped (source_unreachable)",
    );
    expect(warning).toContain("EACCES");
    expect(warning).toContain(manifest);
    expect(warning.split("\n")).toHaveLength(2);
    for (const control of ["\x1b", "\x7f", "\x85", "\x9b"]) {
      expect(warning).not.toContain(control);
    }
  } finally {
    chmodSync(manifest, 0o600);
  }
});
