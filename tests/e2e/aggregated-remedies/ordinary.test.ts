/** C-UPD-47 explicit ordinary failure hints survive real permission denials and previews (§10.1, §13). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { loadSkill } from "../../../src/skill/load.ts";
import { hashSourceDirectory } from "../../../src/sources/read.ts";
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
  sourceFailure,
} from "./helpers.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target = "";
beforeEach(() => {
  target = makeTempDir("crew-remedy-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const kind of ["file", "directory"] as const) {
  test(`C-UPD-47 ordinary ${kind} remedies retain failure identity, bytes, continuation and retry`, () => {
    const home = makeCrewHome();
    const source = makeSkill(makeTempDir(), "broken", skillFrontmatter({ name: "broken" }));
    const healthyRoot = makeTempDir();
    const healthy = makeSkill(healthyRoot, "healthy", skillFrontmatter({ name: "healthy" }));
    makeGitRepo(healthyRoot);
    expect(
      invoke(home, ["install", source, `file://${healthyRoot}`, "--agent", "claude-code"]).code,
    ).toBe(0);
    const before = installed(home, target, "broken");
    writeFileSync(join(source, "asset.txt"), "retry these bytes");
    writeFileSync(join(healthy, "asset.txt"), "healthy update");
    commitAll(healthyRoot, "healthy control changes");
    const frozen = immutable(home, target);
    const blocked = kind === "file" ? join(source, "SKILL.md") : source;
    const hint = kind === "file" ? FILE_HINT : DIRECTORY_HINT;
    chmodSync(blocked, kind === "file" ? 0 : 0o111);
    try {
      const failure = sourceFailure(() =>
        kind === "file" ? loadSkill(source) : hashSourceDirectory(source),
      );
      expect(failure).toBeInstanceOf(CrewError);
      const cause = failure as CrewError;
      expect(cause.code).toBe("source_unreachable");
      expect(cause.message).toContain("EACCES");
      expect(cause.remedy).toBe(hint);
      const expected = { code: cause.code, message: cause.message, remedy: hint };
      for (const args of [
        ["update", "broken", "healthy", "--dry-run"],
        ["outdated", "broken", "healthy"],
      ]) {
        const json = invoke(home, [...args, "--json"]);
        expect(json.code).toBe(1);
        const payload = JSON.parse(json.stdout);
        const row = payload.rows.find((r: { name: string }) => r.name === "broken");
        expect(row.outcome).toEqual({ kind: "failed", error: expected });
        expect(row).toMatchObject({ name: "broken", scope: "user" });
        expect(row).not.toHaveProperty("project_root");
        const human = invoke(home, args);
        const quiet = invoke(home, [...args, "--quiet"]);
        expect(human.code).toBe(1);
        expect(human.stdout).toContain(`source unreachable: ${cause.message}; next step: ${hint}`);
        expect(human.stderr).toBe("");
        expect(quiet.code).toBe(1);
        expect(quiet.stdout).toBe("");
        expect(quiet.stderr).toBe(
          `broken: failed (source_unreachable): ${cause.message}; next step: ${hint}\n` +
            (kind === "file"
              ? `broken (from broken): failed (source_unreachable): ${cause.message}; next step: ${hint}\n`
              : ""),
        );
        const quietJson = invoke(home, [...args, "--quiet", "--json"]);
        expect(quietJson).toEqual(json);
        expect(immutable(home, target)).toEqual(frozen);
      }
      const json = invoke(home, ["update", "broken", "healthy", "--json"]);
      expect(json.code).toBe(1);
      const outcome = JSON.parse(json.stdout).rows.find(
        (r: { name: string }) => r.name === "broken",
      ).outcome;
      expect(outcome.error).toEqual(expected);
      expect(installed(home, target, "broken")).toEqual(before);
      expect(readFileSync(join(target, "healthy", "asset.txt"), "utf8")).toBe("healthy update");
      const human = invoke(home, ["update", "broken"]);
      const quiet = invoke(home, ["update", "broken", "--quiet"]);
      expect(human.code).toBe(1);
      expect(human.stdout).toContain(`; next step: ${hint}`);
      expect(quiet.code).toBe(1);
      expect(quiet.stdout).toBe("");
      expect(quiet.stderr).toContain(`; next step: ${hint}`);
      expect(installed(home, target, "broken")).toEqual(before);
    } finally {
      chmodSync(blocked, kind === "file" ? 0o600 : 0o755);
    }
    expect(invoke(home, ["update", "broken", "--json"]).code).toBe(0);
    expect(readFileSync(join(target, "broken", "asset.txt"), "utf8")).toBe("retry these bytes");
    for (const command of ["update", "outdated"]) {
      expect(invoke(home, [command, "broken", "--quiet"])).toEqual({
        code: 0,
        stdout: "",
        stderr: "",
      });
    }
  });
}
