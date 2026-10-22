/** C-UPD-43 survey and inaccessible-source rows preserve each install location (§10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { commitAll, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import type { UpdateJson } from "../update-dry-run/helpers.ts";
import { fixture, locations, MODES } from "./helpers.ts";

const original = {
  userPath: claudeCodeAdapter.userPath,
  projectPath: claudeCodeAdapter.projectPath,
  detect: claudeCodeAdapter.detect,
};
beforeEach(() => {
  const userRoot = makeTempDir("crew-project-survey-user-");
  claudeCodeAdapter.userPath = () => userRoot;
  claudeCodeAdapter.projectPath = (cwd) => join(cwd, ".claude", "skills");
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const mode of MODES) {
  test(`C-UPD-43 ${mode.join(" ")} identifies rejected locations, conflicts, and vanished sources`, () => {
    const { source, projects, call, setup } = fixture();
    expect(setup).toEqual([0, 0, 0, 0, 0]);
    rmSync(join(source, "alpha"), { recursive: true });
    makeSkill(source, "first", skillFrontmatter({ name: "conflict" }));
    makeSkill(source, "second", skillFrontmatter({ name: "conflict" }));
    makeSkill(source, "rejected", "description: missing declared name");
    commitAll(source, "survey changes");
    const result = call([...mode, "--json"]);
    expect(result.code).toBe(1);
    const rows = (JSON.parse(result.out) as UpdateJson).tap_reexpand_rows;
    expect(locations(rows.filter((row) => row.kind === "source_gone"))).toEqual(
      [...projects, "user"].sort(),
    );
    expect(locations(rows.filter((row) => row.error?.code === "conflicting_dependencies"))).toEqual(
      [...projects, "user"].sort(),
    );
    const rejected = rows.filter((row) => row.error?.code === "invalid_skill");
    expect(locations(rejected)).toEqual([...projects, "user"].sort());
    expect(
      rejected.every((row) => row.name === "team" && row.error?.message.includes("rejected")),
    ).toBe(true);
    const quiet = call([...mode, "--quiet"]);
    expect(quiet.code).toBe(1);
    expect(quiet.out).toBe("");
    for (const project of projects)
      expect(
        quiet.err
          .split("\n")
          .some(
            (line) =>
              line.includes("team") &&
              line.includes(`(in ${project})`) &&
              line.includes("rejected"),
          ),
      ).toBe(true);
  });
}

test("C-UPD-43 inaccessible-source group errors preserve project roots and installed bytes", () => {
  const { home, source, projects, call, setup } = fixture();
  expect(setup).toEqual([0, 0, 0, 0, 0]);
  const before = readFileSync(join(home, "state.json"), "utf8");
  const markers = projects.map((project) =>
    readFileSync(join(project, ".claude", "skills", "alpha", ".crew.json"), "utf8"),
  );
  chmodSync(source, 0);
  try {
    const result = call(["update", "--dry-run", "--json"]);
    expect(result.code).toBe(1);
    const rows = (JSON.parse(result.out) as UpdateJson).tap_reexpand_rows;
    expect(locations(rows)).toEqual([...projects, "user"].sort());
    expect(
      rows.every((row) => row.kind === "tap_error" && row.error?.code === "source_unreachable"),
    ).toBe(true);
    expect(readFileSync(join(home, "state.json"), "utf8")).toBe(before);
    for (const [index, project] of projects.entries())
      expect(readFileSync(join(project, ".claude", "skills", "alpha", ".crew.json"), "utf8")).toBe(
        markers[index]!,
      );
  } finally {
    chmodSync(source, 0o755);
  }
});
