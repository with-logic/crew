/** C-UPD-47 tracked group hints preserve project identity and healthy local Git work (§10.1.1, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { loadSkill } from "../../../src/skill/load.ts";
import { listSourceDirectory } from "../../../src/sources/read.ts";
import { readState } from "../../../src/state/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";
import {
  DIRECTORY_HINT,
  FILE_HINT,
  immutable,
  installed,
  invoke,
  removeOfflineCore,
  sourceFailure,
} from "./helpers.ts";

const original = {
  userPath: claudeCodeAdapter.userPath,
  projectPath: claudeCodeAdapter.projectPath,
  detect: claudeCodeAdapter.detect,
};
let target = "";
beforeEach(() => {
  target = makeTempDir("crew-remedy-groups-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.projectPath = (cwd) => join(cwd, ".claude", "skills");
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const kind of ["file", "directory"] as const) {
  test(`C-UPD-47 tracked ${kind} denial retains user/project hints, previews and retries`, () => {
    const home = makeCrewHome();
    const root = makeTempDir();
    const source = makeSkill(root, "broken", skillFrontmatter({ name: "broken" }));
    const healthyRoot = makeTempDir();
    const healthy = makeSkill(healthyRoot, "healthy", skillFrontmatter({ name: "healthy" }));
    makeGitRepo(healthyRoot);
    expect(
      invoke(home, ["install", root, `file://${healthyRoot}`, "--agent", "claude-code"]).code,
    ).toBe(0);
    const project = makeTempDir("crew-remedy-project-");
    const projectTarget = join(project, ".claude", "skills");
    expect(
      invoke(home, ["install", root, "--scope", "project", "--agent", "claude-code"], project).code,
    ).toBe(0);
    removeOfflineCore(home);
    const before = installed(home, target, "broken");
    const projectBefore = installed(home, projectTarget, "broken");
    writeFileSync(join(healthy, "asset.txt"), "healthy bytes");
    makeSkill(healthyRoot, "healthy-child", skillFrontmatter({ name: "healthy-child" }));
    commitAll(healthyRoot, "healthy update and child");
    const frozen = immutable(home, target, projectTarget);
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
      for (const args of [["update", "--dry-run"], ["outdated"]]) {
        const json = invoke(home, [...args, "--json"]);
        expect(json.code).toBe(1);
        const payload = JSON.parse(json.stdout);
        const errors = payload.tap_reexpand_rows.filter(
          (row: { name: string }) => row.name === "broken",
        );
        expect(errors).toHaveLength(2);
        for (const row of errors) {
          expect(row.error).toEqual({ code: cause.code, message: cause.message, remedy: hint });
          expect(row.kind).toBe("tap_error");
          expect(row.tap).toBe(before.entries[0]!.source.tap);
          if (row.scope === "project") expect(row.project_root).toBe(project);
          else expect(row).not.toHaveProperty("project_root");
        }
        const ordinary = payload.rows.filter((row: { name: string }) => row.name === "broken");
        expect(
          ordinary.every(
            (row: any) => row.outcome.kind === (kind === "file" ? "failed" : "up_to_date"),
          ),
        ).toBe(true);
        const human = invoke(home, args);
        const quiet = invoke(home, [...args, "--quiet"]);
        expect(human.code).toBe(1);
        expect(human.stdout).toContain(`  Next step: ${hint}`);
        expect(human.stdout).toContain(`(in ${project})`);
        expect(quiet.code).toBe(1);
        expect(quiet.stdout).toBe("");
        expect(quiet.stderr).toContain(`; next step: ${hint}`);
        expect(quiet.stderr).toContain(
          `broken (in ${project}) (from ${before.entries[0]!.source.tap})`,
        );
        expect(invoke(home, [...args, "--quiet", "--json"])).toEqual(json);
        expect(immutable(home, target, projectTarget)).toEqual(frozen);
      }
      const human = invoke(home, ["update"]);
      const json = invoke(home, ["update", "--json"]);
      const quiet = invoke(home, ["update", "--quiet"]);
      for (const result of [human, json, quiet]) expect(result.code).toBe(1);
      expect(human.stdout).toContain(`  Next step: ${hint}`);
      expect(quiet.stdout).toBe("");
      expect(quiet.stderr).toContain(`; next step: ${hint}`);
      const errors = JSON.parse(json.stdout).tap_reexpand_rows.filter(
        (row: { name: string }) => row.name === "broken",
      );
      expect(errors).toHaveLength(2);
      for (const row of errors) expect(row.error.remedy).toBe(hint);
      expect(installed(home, target, "broken")).toEqual(before);
      expect(installed(home, projectTarget, "broken")).toEqual(projectBefore);
      expect(readFileSync(join(target, "healthy", "asset.txt"), "utf8")).toBe("healthy bytes");
      expect(readState(home).installations.some((entry) => entry.name === "healthy-child")).toBe(
        true,
      );
    } finally {
      chmodSync(blocked, kind === "file" ? 0o600 : 0o755);
    }
    expect(invoke(home, ["update", "--json"]).code).toBe(0);
    expect(installed(home, target, "broken")).toEqual(before);
    expect(installed(home, projectTarget, "broken")).toEqual(projectBefore);
  });
}
