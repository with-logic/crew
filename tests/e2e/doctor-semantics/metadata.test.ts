/** Semantic marker rejection preserves all repair inputs; valid aliases and SHA case survive (§11.2, §12.2). */
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { codexAdapter } from "../../../src/agents/codex.ts";
import { ALL_AGENTS } from "../../../src/agents/registry.ts";
import {
  resetAutoupdatePlatform,
  setAutoupdatePlatform,
} from "../../../src/autoupdate/scheduler.ts";
import { readState } from "../../../src/state/load.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { INVALID_METADATA } from "./cases.ts";
import { bytes, installed, invoke } from "./fixtures.ts";

const originals = ALL_AGENTS.map((adapter) => ({
  adapter,
  userPath: adapter.userPath,
  projectPath: adapter.projectPath,
  detect: adapter.detect,
}));
let target: string;
let cwd: string;
beforeEach(() => {
  target = makeTempDir();
  cwd = makeTempDir();
  for (const adapter of ALL_AGENTS) {
    adapter.userPath = () => join(target, adapter.name);
    adapter.projectPath = (root) => join(root, adapter.name);
    adapter.detect = () => false;
  }
  claudeCodeAdapter.detect = () => true;
  setAutoupdatePlatform("freebsd");
});
afterEach(() => {
  for (const { adapter, userPath, projectPath, detect } of originals)
    Object.assign(adapter, { userPath, projectPath, detect });
  resetAutoupdatePlatform();
});

for (const scope of ["user", "project"] as const) {
  for (const statePresent of [true, false]) {
    for (const scenario of INVALID_METADATA) {
      test(`C-STATE-14 ${scope} ${scenario.name}, state present=${statePresent}, blocks every doctor mode without writes`, () => {
        const { home, source, markerPath, marker, installation } = installed(
          scenario.kind,
          scope,
          cwd,
          target,
        );
        expect(installation.code).toBe(0);
        writeFileSync(markerPath, JSON.stringify({ ...marker, ...scenario.fields }));
        if (!statePresent) rmSync(join(home, "state.json"));
        const orphan = join(home, "store", "orphan@12345678");
        mkdirSync(orphan);
        writeFileSync(join(orphan, "sentinel"), "preserve orphan bytes\n");
        const roots = [
          join(home, "state.json"),
          join(home, "config.yaml"),
          join(home, "store"),
          source,
          target,
          cwd,
        ];
        const before = bytes(roots);
        for (const flags of [[], ["--repair"], ["--repair", "--dry-run"]]) {
          const result = invoke(home, cwd, ["doctor", ...flags, "--json"]);
          expect(result.code).toBe(1);
          const data = result.json();
          expect(data.findings).toContainEqual(
            expect.objectContaining({
              level: "error",
              code: "marker_invalid",
              message: expect.stringContaining(markerPath),
            }),
          );
          if (flags.length === 1) expect(data.repairs).toEqual([]);
          expect(bytes(roots)).toEqual(before);
        }
        const preview = invoke(home, cwd, ["doctor", "--repair", "--dry-run"]);
        expect(preview.code).toBe(1);
        expect(preview.text).toContain("would address 0 findings");
        expect(bytes(roots)).toEqual(before);
      });
    }
  }

  for (const kind of ["path", "git"] as const) {
    for (const uppercase of kind === "git" ? [false, true] : [false]) {
      test(`C-STATE-14 ${scope} generated ${kind} uppercase SHA=${uppercase} repairs without losing live store bytes`, () => {
        const { home, source, markerPath, marker, installDir, installation } = installed(
          kind,
          scope,
          cwd,
          target,
        );
        expect(installation.code).toBe(0);
        const expectedSha = uppercase ? marker.resolved_sha!.toUpperCase() : marker.resolved_sha;
        if (uppercase)
          writeFileSync(markerPath, JSON.stringify({ ...marker, resolved_sha: expectedSha }));
        const key =
          marker.resolved_sha === null
            ? marker.content_hash.slice(7, 15)
            : marker.resolved_sha.slice(0, 8);
        const store = join(home, "store", `demo@${key}`);
        const protectedRoots = [source, installDir, store];
        const before = bytes(protectedRoots);
        rmSync(join(home, "state.json"));
        expect(invoke(home, cwd, ["doctor", "--repair", "--json"]).code).toBe(0);
        expect(readState(home).installations[0]!.resolved_sha).toBe(expectedSha);
        expect(bytes(protectedRoots)).toEqual(before);
        expect(invoke(home, cwd, ["cache", "clean", "--json"]).code).toBe(0);
        expect(bytes(protectedRoots)).toEqual(before);
      });
    }
  }

  test(`C-STATE-14 ${scope} generated shared owners through a base alias remain trusted`, () => {
    const { home, ref, markerPath, installDir, installation } = installed(
      "path",
      scope,
      cwd,
      target,
    );
    expect(installation.code).toBe(0);
    const alias = join(makeTempDir(), "alias");
    symlinkSync(join(scope === "user" ? target : cwd, "claude-code"), alias);
    codexAdapter.userPath = () => alias;
    codexAdapter.projectPath = () => alias;
    codexAdapter.detect = () => true;
    expect(invoke(home, cwd, ["install", ref, "--agent", "codex", "--scope", scope]).code).toBe(0);
    const before = bytes([installDir, alias]);
    const markerBytes = readFileSync(markerPath);
    rmSync(join(home, "state.json"));
    expect(invoke(home, cwd, ["doctor", "--repair", "--json"]).code).toBe(0);
    expect(readState(home).installations[0]!.agents).toEqual(["claude-code", "codex"]);
    expect(readFileSync(markerPath)).toEqual(markerBytes);
    expect(bytes([installDir, alias])).toEqual(before);
    expect(existsSync(alias)).toBe(true);
  });
}
