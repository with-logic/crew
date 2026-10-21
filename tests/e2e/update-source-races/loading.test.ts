/** Input-getter synchronized real filesystem mutations at the planner's load transition (§10.1, C-UPD-44). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readState } from "../../../src/state/load.ts";
import { captureStreams } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { afterPlan, atLoadBoundary, fixture, plan, snapshot } from "./fixtures.ts";

const original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
let target: string;
beforeEach(() => {
  target = makeTempDir("crew-update-races-target-");
  claudeCodeAdapter.userPath = () => target;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => Object.assign(claudeCodeAdapter, original));

for (const mode of [
  "missing",
  "file",
  "loop",
  "missing-manifest",
  "invalid-manifest",
  "permission",
] as const) {
  for (const dryRun of [false, true]) {
    test(`C-UPD-44 ${mode} at load transition, dry-run=${dryRun}`, () => {
      const f = fixture(target);
      expect(f.setupCodes).toEqual([0, 0]);
      const manifest = join(f.skill, "SKILL.md");
      let fired = false;
      const entry = atLoadBoundary(f, () => {
        fired = true;
        if (mode === "missing-manifest") rmSync(manifest);
        else if (mode === "invalid-manifest") writeFileSync(manifest, "invalid frontmatter\n");
        else if (mode === "permission") chmodSync(manifest, 0);
        else {
          rmSync(f.skill, { recursive: true });
          if (mode === "file") writeFileSync(f.skill, "replaced\n");
          if (mode === "loop") symlinkSync("demo", f.skill);
        }
      });
      try {
        const result = plan(f, entry, dryRun);
        expect(fired).toBe(true);
        const gone = mode === "missing" || mode === "file" || mode === "loop";
        expect(result.rows.find((row) => row.name === "demo")?.outcome).toMatchObject(
          gone
            ? { kind: "source_gone" }
            : {
                kind: "failed",
                error: { code: mode === "permission" ? "source_unreachable" : "invalid_skill" },
              },
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
      } finally {
        if (mode === "permission") chmodSync(manifest, 0o600);
      }
    });
  }
}

for (const mode of ["missing-manifest", "invalid-manifest", "permission"] as const) {
  for (const dryRun of [false, true])
    test(`C-UPD-44 actual CLI ${mode} remains hard, dry-run=${dryRun}`, () => {
      const f = fixture(target);
      expect(f.setupCodes).toEqual([0, 0]);
      const manifest = join(f.skill, "SKILL.md");
      if (mode === "missing-manifest") rmSync(manifest);
      if (mode === "invalid-manifest") writeFileSync(manifest, "invalid frontmatter\n");
      if (mode === "permission") chmodSync(manifest, 0);
      try {
        const capture = captureStreams();
        expect(
          runCli(["update", "demo", "healthy", "--json", ...(dryRun ? ["--dry-run"] : [])], {
            home: f.home,
            streams: capture.streams,
          }),
        ).toBe(1);
        const output = JSON.parse(capture.stdout());
        expect(output.rows[0].outcome).toMatchObject({
          kind: "failed",
          error: { code: mode === "permission" ? "source_unreachable" : "invalid_skill" },
        });
        expect(output.rows[1].outcome.kind).toBe(dryRun ? "would_update" : "updated");
        expect(snapshot(join(target, "demo"))).toEqual(f.installed);
        expect(readState(f.home).installations.find((entry) => entry.name === "demo")).toEqual(
          f.original,
        );
        expect(capture.stdout()).not.toContain('"cause"');
        if (dryRun) {
          expect(snapshot(target)).toEqual(f.allInstalled);
          expect(snapshot(join(f.home, "store"))).toEqual(f.store);
          expect(readFileSync(join(f.home, "state.json"))).toEqual(f.stateBytes);
        }
      } finally {
        if (mode === "permission") chmodSync(manifest, 0o600);
      }
    });
}
