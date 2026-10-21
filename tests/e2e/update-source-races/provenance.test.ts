/** Preserve original source failure identity when a later filesystem change removes the root (§10.1, C-UPD-44). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { CrewError } from "../../../src/core/errors.ts";
import { hashDirectory } from "../../../src/hash/content.ts";
import { loadSkill } from "../../../src/skill/load.ts";
import { readBytes } from "../../../src/util/fs.ts";
import { readSourceFile } from "../../../src/util/source-read.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { afterPlan, atLoadBoundary, fixture, plan } from "./fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target: string;
beforeEach(() => {
  target = makeTempDir("crew-update-provenance-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const dryRun of [false, true]) {
  for (const mode of ["missing", "file", "loop", "resource-only"] as const) {
    test(`C-UPD-44 real hash read failure ${mode} carried by entry input, dry-run=${dryRun}`, () => {
      const f = fixture(target);
      expect(f.setupCodes).toEqual([0, 0]);
      let failure: unknown;
      // The existing hash reader input mutates after walking, before the real file read.
      const entry = atLoadBoundary(f, () =>
        hashDirectory(f.skill, (file) => {
          if (mode === "resource-only") rmSync(file);
          else {
            rmSync(f.skill, { recursive: true });
            if (mode === "file") writeFileSync(f.skill, "replaced\n");
            if (mode === "loop") symlinkSync("demo", f.skill);
          }
          try {
            return readSourceFile(file, readBytes);
          } catch (err) {
            failure = err;
            throw err;
          }
        }),
      );
      const result = plan(f, entry, dryRun);
      expect(failure).toBeInstanceOf(CrewError);
      const gone = mode !== "resource-only";
      expect(result.rows[0]?.outcome).toMatchObject(
        gone ? { kind: "source_gone" } : { kind: "failed", error: { code: "source_unreachable" } },
      );
      expect(result.hardFailure).toBe(!gone);
      expect(f.boundaryChecks).toEqual([{ available: true, hashChanged: true }]);
      expect(afterPlan(f, result, dryRun)).toEqual({
        installed: f.installed,
        entry: f.original,
        stateBytes: f.stateBytes,
        healthy: dryRun ? "would_update" : "updated",
        preview: dryRun ? { installed: f.allInstalled, store: f.store, state: f.state } : null,
        healthyBytes: dryRun ? null : "healthy update\n",
      });
    });
  }

  for (const mode of ["permission", "parser", "symlink", "unexpected"] as const) {
    test(`C-UPD-44 original ${mode} failure stays hard after root removal, dry-run=${dryRun}`, () => {
      const f = fixture(target);
      expect(f.setupCodes).toEqual([0, 0]);
      let failure: unknown;
      const entry = atLoadBoundary(f, () => {
        const manifest = join(f.skill, "SKILL.md");
        if (mode === "permission") chmodSync(manifest, 0);
        if (mode === "parser") writeFileSync(manifest, "invalid frontmatter\n");
        if (mode === "symlink") {
          rmSync(manifest);
          symlinkSync("changed.txt", manifest);
        }
        try {
          if (mode === "unexpected") throw new Error("unexpected read failure");
          loadSkill(f.skill);
        } catch (err) {
          failure = err;
          if (mode === "permission") chmodSync(manifest, 0o600);
          rmSync(f.skill, { recursive: true });
          throw err;
        }
      });
      const result = plan(f, entry, dryRun);
      expect(failure).toBeInstanceOf(Error);
      const error = failure as CrewError;
      expect(result.rows[0]?.outcome).toEqual({
        kind: "failed",
        error: { code: error.code ?? "usage_error", message: error.message },
      });
      expect(result.hardFailure).toBe(true);
      expect(f.boundaryChecks).toEqual([{ available: true, hashChanged: true }]);
      expect(afterPlan(f, result, dryRun)).toEqual({
        installed: f.installed,
        entry: f.original,
        stateBytes: f.stateBytes,
        healthy: dryRun ? "would_update" : "updated",
        preview: dryRun ? { installed: f.allInstalled, store: f.store, state: f.state } : null,
        healthyBytes: dryRun ? null : "healthy update\n",
      });
    });
  }
}
