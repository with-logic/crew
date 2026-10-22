/** Individual Git-directory absence stays soft; validation and permissions stay hard (§10.1/10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { accessSync, chmodSync, constants, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import { readState } from "../../../src/state/load.ts";
import { cloneDirForTap, makeTempDir } from "../../helpers/fixtures.ts";
import {
  allResources,
  changeUpstream,
  fixture,
  invoke,
  MODES,
  retainedResources,
  runMode,
  type Targets,
  type UpdateJson,
} from "./fixtures.ts";

let targets: Targets;
let originals: {
  userPath: () => string;
  projectPath: (cwd: string) => string;
  detect: () => boolean;
}[];
beforeEach(() => {
  targets = {
    user: makeTempDir("crew-individual-users-"),
    project: makeTempDir("crew-individual-projects-"),
  };
  originals = ALL_AGENTS.map((adapter) => ({
    userPath: adapter.userPath,
    projectPath: adapter.projectPath,
    detect: adapter.detect,
  }));
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(targets.user, adapter.name);
    adapter.projectPath = () => join(targets.project, adapter.name);
    adapter.detect = () => adapter.name === "claude-code" || adapter.name === "codex";
  }
});
afterEach(() => {
  for (const [index, adapter] of ALL_AGENTS.entries()) Object.assign(adapter, originals[index]);
});

for (const mode of MODES) {
  for (const json of [false, true]) {
    for (const change of [
      "deleted",
      "missing-manifest",
      "invalid-manifest",
      "permission",
    ] as const) {
      test(`C-UPD-11/12/13/18/18f ${mode}, JSON=${json}, individual ${change}`, () => {
        const f = fixture(targets);
        expect(f.setup.map((result) => result.code)).toEqual([0, 0, 0]);
        expect(f.original.installations).toHaveLength(3);
        for (const entry of f.original.installations) {
          expect(entry.ref).toBeNull();
          expect(entry.pinned).toBe(false);
          expect(entry.tracks_tap).toBeUndefined();
          expect(entry.source).toEqual({ tap: "fixture", path: entry.name });
          expect([...entry.agents].sort()).toEqual(["claude-code", "codex"]);
        }
        const sha = changeUpstream(f, change);
        if (change === "permission")
          expect(invoke(f.home, f.cwd, ["tap", "update", "fixture"]).code).toBe(0);
        const clone = cloneDirForTap("fixture", f.home)!;
        const source = join(clone, "demo");
        const before = allResources(f);
        const retained = retainedResources(f);
        if (change === "permission") chmodSync(source, 0o444);
        try {
          if (change === "permission") {
            expect(() => accessSync(source, constants.X_OK)).toThrow(/EACCES/);
            expect(statSync(source).mode & 0o777).toBe(0o444);
          }
          const result = runMode(f, mode, json);
          const gone = change === "deleted";
          expect(result.code).toBe(gone ? 0 : 1);
          expect(result.stderr).toBe("");
          if (json) {
            const output = JSON.parse(result.stdout) as UpdateJson;
            expect(output.rows).toHaveLength(2);
            expect(output.rows.find((row) => row.name === "demo")?.outcome).toMatchObject(
              gone
                ? { kind: "source_gone" }
                : {
                    kind: "failed",
                    error: {
                      code: change === "permission" ? "source_unreachable" : "invalid_skill",
                    },
                  },
            );
            if (change === "permission")
              expect(output.rows.find((row) => row.name === "demo")?.outcome).toMatchObject({
                error: { message: expect.stringContaining("EACCES") },
              });
            expect(output.rows.find((row) => row.name === "healthy")?.outcome).toMatchObject({
              kind: mode === "update" ? "updated" : "would_update",
              new_sha: sha,
            });
            expect(output.tap_reexpand_rows).toEqual([]);
            expect(output.tap_rows).toContainEqual(
              expect.objectContaining({ name: "fixture", kind: "refreshed" }),
            );
            expect(output.dry_run).toBe(mode !== "update");
          } else {
            expect(result.stdout).toMatch(
              gone
                ? /demo[^\n]*source no longer available[^\n]*keeping your copy/
                : /demo[^\n]*failed/,
            );
            if (!gone)
              expect(result.stdout).toContain(
                change === "permission" ? "source unreachable" : "invalid skill",
              );
            expect(result.stdout).toMatch(
              mode === "update" ? /healthy[^\n]*updated/ : /healthy[^\n]*would update/,
            );
          }
          expect(result.stdout).not.toContain("unrelated");
          expect(result.stdout).not.toContain("new-sibling");
          expect(existsSync(source)).toBe(!gone);
          if (!gone && change !== "permission")
            expect(existsSync(join(source, "resource.bin"))).toBe(true);
          if (change === "missing-manifest")
            expect(existsSync(join(source, "SKILL.md"))).toBe(false);
          if (change === "permission") expect(statSync(source).mode & 0o777).toBe(0o444);
          expect(retainedResources(f)).toEqual(retained);
          expect(readState(f.home).installations).toHaveLength(3);
          for (const agent of ["claude-code", "codex"]) {
            expect(existsSync(join(targets.user, agent, "new-sibling"))).toBe(false);
            expect(readFileSync(join(targets.user, agent, "healthy", "resource.bin"))).toEqual(
              mode === "update" ? Buffer.from("healthy update\n") : Buffer.from([0, 128, 255]),
            );
          }
          if (mode !== "update") expect(allResources(f)).toEqual(before);
        } finally {
          if (change === "permission") chmodSync(source, 0o755);
        }
      });
    }
  }

  test(`C-UPD-11/13 ${mode} tap-qualified individual selector leaves healthy unprocessed`, () => {
    const f = fixture(targets);
    expect(f.setup.map((result) => result.code)).toEqual([0, 0, 0]);
    changeUpstream(f, "deleted");
    const before = allResources(f);
    const retained = retainedResources(f, ["demo", "healthy", "unrelated"]);
    const result = runMode(f, mode, true, ["fixture/demo"]);
    expect(result.code).toBe(0);
    const output = JSON.parse(result.stdout) as UpdateJson;
    expect(output.rows).toEqual([
      { name: "demo", scope: "user", outcome: { kind: "source_gone" } },
    ]);
    expect(output.selectors).toEqual([{ raw: "fixture/demo", kind: "skill", name: "demo" }]);
    expect(output.tap_reexpand_rows).toEqual([]);
    expect(retainedResources(f, ["demo", "healthy", "unrelated"])).toEqual(retained);
    if (mode !== "update") expect(allResources(f)).toEqual(before);
  });
}

test("C-UPD-18/18f equivalent fresh previews have identical normalized JSON and preserve all resources", () => {
  const outputs: unknown[] = [];
  for (const mode of ["dry-run", "outdated"] as const) {
    targets = {
      user: makeTempDir("crew-individual-parity-user-"),
      project: makeTempDir("crew-individual-parity-project-"),
    };
    const f = fixture(targets);
    expect(f.setup.map((result) => result.code)).toEqual([0, 0, 0]);
    const sha = changeUpstream(f, "deleted");
    const before = allResources(f);
    const result = runMode(f, mode, true);
    expect(result.code).toBe(0);
    expect(allResources(f)).toEqual(before);
    outputs.push(JSON.parse(result.stdout.replaceAll(f.repo, "<repo>").replaceAll(sha, "<sha>")));
  }
  expect(outputs[0]).toEqual(outputs[1]);
});
