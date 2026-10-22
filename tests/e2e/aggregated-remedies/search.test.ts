/** C-TAP-08h configured warnings preserve real read hints as identical human/JSON strings (§16.6). */

import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { loadSkill } from "../../../src/skill/load.ts";
import { listSourceDirectory } from "../../../src/sources/read.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { DIRECTORY_HINT, FILE_HINT, invoke, sourceFailure } from "./helpers.ts";

for (const kind of ["file", "directory"] as const) {
  test(`C-TAP-08h configured ${kind} warnings append one hint while healthy local Git stays searchable`, () => {
    const home = makeCrewHome();
    const root = makeTempDir();
    const source = makeSkill(root, "broken", skillFrontmatter({ name: "broken" }));
    const healthyRoot = makeTempDir();
    makeSkill(healthyRoot, "healthy", skillFrontmatter({ name: "healthy" }));
    makeGitRepo(healthyRoot);
    writeConfig(
      {
        ...readConfig(home),
        taps: [
          { name: "broken", kind: "path", registered: true, path: root, url: "", subpath: "" },
          {
            name: "healthy",
            kind: "git",
            registered: true,
            path: "",
            url: `file://${healthyRoot}`,
            subpath: "",
          },
        ],
      },
      home,
    );
    const blocked = kind === "file" ? join(source, "SKILL.md") : root;
    const hint = kind === "file" ? FILE_HINT : DIRECTORY_HINT;
    chmodSync(blocked, kind === "file" ? 0 : 0o111);
    try {
      const failure = sourceFailure(() =>
        kind === "file" ? loadSkill(source) : listSourceDirectory(root),
      );
      expect(failure).toBeInstanceOf(CrewError);
      const cause = failure as CrewError;
      expect(cause.code).toBe("source_unreachable");
      expect(cause.message).toContain("EACCES");
      expect(cause.remedy).toBe(hint);
      const json = invoke(home, ["search", "--json"]);
      const human = invoke(home, ["search"]);
      expect(json.code).toBe(0);
      expect(human.code).toBe(0);
      const payload = JSON.parse(json.stdout);
      expect(payload.warnings).toEqual([
        `warning: tap \`broken\` skipped (source_unreachable) — ${cause.message}; next step: ${hint}`,
      ]);
      expect(human.stderr).toBe(`${payload.warnings[0]}\n`);
      expect(json.stderr).toBe("");
      expect(payload.hits.map((hit: { name: string }) => hit.name)).toEqual(["healthy"]);
      expect(human.stdout).toContain("healthy");
      expect(payload.warnings[0]).not.toContain("back online");
      expect(payload.warnings[0]).not.toContain("crew tap update");
    } finally {
      chmodSync(blocked, kind === "file" ? 0o600 : 0o755);
    }
    const retry = invoke(home, ["search", "--json"]);
    expect(retry.code).toBe(0);
    expect(JSON.parse(retry.stdout).warnings).toEqual([]);
    expect(JSON.parse(retry.stdout).hits.map((hit: { name: string }) => hit.name)).toEqual([
      "broken",
      "healthy",
    ]);
  });
}
