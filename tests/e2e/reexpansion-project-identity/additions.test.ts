/** C-UPD-43 additions and validation diagnostics identify real project installs (§10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { readState } from "../../../src/state/load.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import type { UpdateJson } from "../update-dry-run/helpers.ts";
import { fixture, locations, MODES } from "./helpers.ts";

const original = {
  userPath: claudeCodeAdapter.userPath,
  projectPath: claudeCodeAdapter.projectPath,
  detect: claudeCodeAdapter.detect,
};
let userRoot: string;
beforeEach(() => {
  userRoot = makeTempDir("crew-project-identity-user-");
  claudeCodeAdapter.userPath = () => userRoot;
  claudeCodeAdapter.projectPath = (cwd) => join(cwd, ".claude", "skills");
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const mode of MODES) {
  for (const json of [false, true]) {
    test(`C-UPD-43 ${mode.join(" ")} additions and failures identify projects, json=${json}`, () => {
      const { home, source, projects, call, setup } = fixture();
      expect(setup).toEqual([0, 0, 0, 0, 0]);
      const before = readFileSync(join(home, "state.json"), "utf8");
      makeSkill(source, "beta", skillFrontmatter({ name: "beta" }));
      makeSkill(source, "broken", "name: broken");
      commitAll(source, "new children");
      const result = call([...mode, ...(json ? ["--json"] : [])]);
      expect(result.code).toBe(1);
      expect(result.err).toBe("");
      if (json) {
        const payload = JSON.parse(result.out) as UpdateJson;
        expect(locations(payload.tap_reexpand_rows.filter((row) => row.name === "beta"))).toEqual(
          [...projects, "user"].sort(),
        );
        expect(locations(payload.tap_reexpand_rows.filter((row) => row.name === "broken"))).toEqual(
          [...projects, "user"].sort(),
        );
        expect(
          payload.tap_reexpand_rows
            .filter((row) => row.name === "broken")
            .every((row) => row.error?.code === "invalid_skill"),
        ).toBe(true);
      } else {
        const lines = result.out.split("\n");
        const additions = lines.filter((line) => line.includes("new skill"));
        expect(additions).toHaveLength(3);
        for (const project of projects) {
          expect(
            additions.some((line) => line.includes(`(in ${project})`) && line.endsWith(": beta")),
          ).toBe(true);
          expect(
            lines.some(
              (line) =>
                line.includes("broken") &&
                line.includes(`(in ${project})`) &&
                line.includes("invalid_skill"),
            ),
          ).toBe(true);
        }
        expect(additions.filter((line) => !line.includes("(in "))).toHaveLength(1);
      }
      const normal = mode.length === 1 && mode[0] === "update";
      for (const root of [
        userRoot,
        ...projects.map((project) => join(project, ".claude", "skills")),
      ]) {
        expect(existsSync(join(root, "beta", "SKILL.md"))).toBe(normal);
        expect(existsSync(join(root, "beta", ".crew.json"))).toBe(normal);
        expect(existsSync(join(root, "broken"))).toBe(false);
      }
      if (normal) {
        const added = readState(home).installations.filter((entry) => entry.name === "beta");
        expect(
          locations(
            added.map((entry) => ({ ...entry, tap: entry.source.tap, kind: "added" as const })),
          ),
        ).toEqual([...projects, "user"].sort());
      } else expect(readFileSync(join(home, "state.json"), "utf8")).toBe(before);
    });
  }

  test(`C-UPD-43 quiet ${mode.join(" ")} errors retain the originating projects`, () => {
    const { source, projects, call, setup } = fixture();
    expect(setup).toEqual([0, 0, 0, 0, 0]);
    makeSkill(source, "broken", "name: broken");
    commitAll(source, "invalid child");
    const result = call([...mode, "--quiet"]);
    expect(result.code).toBe(1);
    expect(result.out).toBe("");
    const lines = result.err.trim().split("\n");
    expect(lines).toHaveLength(3);
    for (const project of projects)
      expect(
        lines.some(
          (line) =>
            line.includes("broken") &&
            line.includes(`(in ${project})`) &&
            line.includes("invalid_skill"),
        ),
      ).toBe(true);
    expect(lines.filter((line) => !line.includes("(in "))).toHaveLength(1);
  });
}
