/**
 * Lockfile entries leaving with their manifest lines (§9.3): a line
 * dropped from `.crewrc` is dropped from `.crewrc.lock`.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { LOCK_HEADER } from "../../../../src/manifest/lock.ts";
import { makeCrewHome } from "../../../helpers/env.ts";
import { redirectClaudeCode, restoreClaudeCode } from "../../../helpers/scoped-install.ts";
import { crew, makeProject, makeSkillRepo, writeManifest } from "../helpers.ts";
import { headSha, lockFile } from "./helpers.ts";

let redirected: ReturnType<typeof redirectClaudeCode>;
beforeEach(() => {
  redirected = redirectClaudeCode();
});
afterEach(() => {
  restoreClaudeCode(redirected.originals);
});

describe("lockfile entries for dropped lines", () => {
  test("C-RC-43 a line dropped from the manifest is dropped from the lockfile", () => {
    const home = makeCrewHome();
    const alpha = makeSkillRepo(["alpha"]);
    const beta = makeSkillRepo(["beta"]);
    const project = makeProject([alpha, beta]);
    expect(crew(home, project, ["install"]).code).toBe(0);

    // The stale entry now names a commit that exists nowhere: if the dropped
    // line were still resolved, the install would fail.
    writeFileSync(
      lockFile(project),
      `${LOCK_HEADER}\n${"d".repeat(40)} ${alpha}\n${headSha(beta)} ${beta}\n`,
    );
    writeManifest(project, [beta]);
    expect(crew(home, project, ["install"]).code).toBe(0);

    expect(readFileSync(lockFile(project), "utf8")).toBe(
      `${LOCK_HEADER}\n${headSha(beta)} ${beta}\n`,
    );
  });

  test("C-RC-43 emptying the manifest empties the lockfile, and still checks it", () => {
    const home = makeCrewHome();
    const project = makeProject([makeSkillRepo(["alpha"])]);
    expect(crew(home, project, ["install"]).code).toBe(0);

    writeManifest(project, []);
    expect(crew(home, project, ["install", "--dry-run"]).code).toBe(0);
    expect(readFileSync(lockFile(project), "utf8")).not.toBe(`${LOCK_HEADER}\n`);
    expect(crew(home, project, ["install"]).code).toBe(0);
    expect(readFileSync(lockFile(project), "utf8")).toBe(`${LOCK_HEADER}\n`);

    writeFileSync(lockFile(project), "not a lockfile\n");
    expect(crew(home, project, ["install"]).code).toBe(4);
  });
});
