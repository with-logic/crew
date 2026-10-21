/** Directory failures warn once per tap while healthy configured search continues (§16.6). */

import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

for (const mode of [0o111, 0o444]) {
  for (const json of [false, true]) {
    test(`search preserves healthy hits beside inaccessible taps (${mode.toString(8)}, ${json ? "JSON" : "human"})`, () => {
      const home = makeCrewHome();
      const broken = makeTempDir();
      makeSkill(join(broken, "skills", "team"), "hidden", skillFrontmatter({ name: "hidden" }));
      const healthy = makeTempDir();
      makeSkill(healthy, "healthy", skillFrontmatter({ name: "healthy" }));
      const taps = [broken, healthy, broken].map((path, i) => ({
        name: `tap-${i}`,
        kind: "path" as const,
        registered: true,
        path,
        url: "",
        subpath: "",
      }));
      writeConfig({ ...readConfig(home), taps }, home);
      const blocked = join(broken, "skills", "team");
      chmodSync(blocked, mode);
      try {
        const capture = captureStreams();
        expect(
          runCli(["search", ...(json ? ["--json"] : [])], { home, streams: capture.streams }),
        ).toBe(0);
        const result = json ? JSON.parse(capture.stdout()) : null;
        const warnings = json ? result.warnings : capture.stderr().trim().split("\n");
        expect(warnings).toHaveLength(2);
        for (const warning of warnings) {
          expect(warning).toContain("source_unreachable");
          expect(warning).toContain("EACCES");
          expect(warning).toContain(blocked);
          expect(warning).not.toContain("back online");
        }
        expect(warnings[0]).toContain("tap-0");
        expect(warnings[1]).toContain("tap-2");
        if (json) expect(result.hits.map((hit: { name: string }) => hit.name)).toEqual(["healthy"]);
        else expect(capture.stdout()).toContain("healthy");
      } finally {
        chmodSync(blocked, 0o755);
      }
    });
  }
}
