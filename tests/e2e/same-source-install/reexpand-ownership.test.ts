/** New tap children respect canonical source ownership before writes (§5.4, §10.1.1). */

import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../../src/agents/claude-code.ts";
import { runCli } from "../../../src/cli/main.ts";
import { readConfig, writeConfig } from "../../../src/config/load.ts";
import { readState, writeState } from "../../../src/state/load.ts";
import { captureStreams, makeCrewHome } from "../../helpers/env.ts";
import {
  commitAll,
  makeGitRepo,
  makeSkill,
  makeTempDir,
  skillFrontmatter,
} from "../../helpers/fixtures.ts";

let root: string;
let original: { userPath: () => string; detect: () => boolean };
beforeEach(() => {
  root = makeTempDir();
  original = { userPath: claudeCodeAdapter.userPath, detect: claudeCodeAdapter.detect };
  claudeCodeAdapter.userPath = () => root;
  claudeCodeAdapter.detect = () => true;
});
afterEach(() => {
  claudeCodeAdapter.userPath = original.userPath;
  claudeCodeAdapter.detect = original.detect;
});

function fixture() {
  const home = makeCrewHome();
  const invoke = (args: string[]) => {
    const cap = captureStreams();
    const code = runCli(args, { home, streams: cap.streams });
    return { code, output: cap.stdout() };
  };
  const first = makeTempDir();
  makeSkill(first, "alpha", skillFrontmatter({ name: "alpha" }));
  makeGitRepo(first);
  const foreign = makeTempDir();
  makeSkill(foreign, "shared", skillFrontmatter({ name: "shared" }), "foreign bytes");
  makeGitRepo(foreign);
  for (const [repo, tap] of [
    [first, "first"],
    [foreign, "foreign"],
  ]) {
    if (invoke(["tap", "add", `file://${repo}`, tap!]).code !== 0)
      throw new Error("tap fixture failed");
    if (invoke(["install", tap!, "--agent", "claude-code"]).code !== 0)
      throw new Error("install fixture failed");
  }
  makeSkill(first, "shared", skillFrontmatter({ name: "shared" }), "replacement bytes");
  makeSkill(first, "healthy", skillFrontmatter({ name: "healthy" }));
  commitAll(first, "new children");
  return { home, invoke, first, dest: join(root, "shared") };
}

for (const owner of ["state", "marker", "missing-tap", "mixed-state"] as const) {
  for (const flags of [[], ["--force"], ["--dry-run"], ["--dry-run", "--force"]]) {
    test(`C-INST-14 re-expansion protects ${owner} ownership with ${flags.join(" ")}`, () => {
      const { home, invoke, dest } = fixture();
      const state = readState(home);
      const foreign = state.installations.find((e) => e.name === "shared")!;
      if (owner === "marker") {
        writeState(
          { ...state, installations: state.installations.filter((e) => e !== foreign) },
          home,
        );
      } else if (owner === "missing-tap") {
        writeState(
          {
            ...state,
            installations: state.installations.map((e) =>
              e === foreign ? { ...e, source: { ...e.source, tap: "missing" } } : e,
            ),
          },
          home,
        );
        rmSync(join(dest, ".crew.json"));
      } else if (owner === "mixed-state") {
        const config = readConfig(home);
        const tap = config.taps.find((t) => t.name === "first")!;
        writeConfig({ ...config, taps: [...config.taps, { ...tap, name: "alias" }] }, home);
        writeState(
          {
            ...state,
            installations: [
              ...state.installations,
              { ...foreign, source: { tap: "alias", path: "shared" } },
            ],
          },
          home,
        );
      }
      const before = readState(home).installations.filter((e) => e.name === "shared");
      const bytes = readFileSync(join(dest, "SKILL.md"), "utf8");
      const marker =
        owner === "missing-tap" ? null : readFileSync(join(dest, ".crew.json"), "utf8");
      const result = invoke(["update", "first", "--json", ...flags]);
      expect(result.code).toBe(1);
      const rows = JSON.parse(result.output).tap_reexpand_rows;
      expect(rows).toContainEqual(
        expect.objectContaining({
          name: "shared",
          kind: "tap_error",
          error: expect.objectContaining({ code: "name_conflict" }),
        }),
      );
      expect(rows).toContainEqual(
        expect.objectContaining({
          name: "healthy",
          kind: flags.includes("--dry-run") ? "would_add" : "added",
        }),
      );
      expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe(bytes);
      if (marker !== null) expect(readFileSync(join(dest, ".crew.json"), "utf8")).toBe(marker);
      expect(readState(home).installations.filter((e) => e.name === "shared")).toEqual(before);
    });
  }
}

for (const broken of ["invalid-json", "null", "kind", "url", "path", "schema"] as const) {
  for (const flags of [["--force"], ["--force", "--dry-run"]]) {
    test(`C-INST-14 malformed marker ${broken} cannot bypass ownership ${flags.join(" ")}`, () => {
      const { home, invoke, first, dest } = fixture();
      const state = readState(home);
      writeState(
        { ...state, installations: state.installations.filter((e) => e.name !== "shared") },
        home,
      );
      const markerPath = join(dest, ".crew.json");
      const marker = JSON.parse(readFileSync(markerPath, "utf8"));
      // A valid matching source would be accepted; each mutation must prevent that.
      marker.tap_url = `file://${first}`;
      if (broken === "kind") marker.tap_kind = "unexpected";
      if (broken === "url") marker.tap_url = 42;
      if (broken === "path") delete marker.path;
      if (broken === "schema") marker.schema_version = 2;
      const bytes = readFileSync(join(dest, "SKILL.md"), "utf8");
      const malformed =
        broken === "invalid-json" ? "{" : broken === "null" ? "null" : JSON.stringify(marker);
      writeFileSync(markerPath, malformed);
      const result = invoke(["update", "first", "--json", ...flags]);
      expect(result.code).toBe(1);
      expect(JSON.parse(result.output).tap_reexpand_rows).toContainEqual(
        expect.objectContaining({
          name: "shared",
          kind: "tap_error",
          error: expect.objectContaining({ code: "name_conflict" }),
        }),
      );
      expect(readFileSync(join(dest, "SKILL.md"), "utf8")).toBe(bytes);
      expect(readFileSync(markerPath, "utf8")).toBe(malformed);
      expect(readState(home).installations.some((e) => e.name === "shared")).toBe(false);
    });
  }
}

for (const preview of [false, true]) {
  test(`C-INST-13e marker-only canonical aliases are accepted (${preview})`, () => {
    const { home, invoke, first, dest } = fixture();
    const state = readState(home);
    writeState(
      { ...state, installations: state.installations.filter((e) => e.name !== "shared") },
      home,
    );
    const markerPath = join(dest, ".crew.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    marker.tap_name = "different-alias";
    marker.tap_url = `file://${first}/`;
    writeFileSync(markerPath, JSON.stringify(marker));
    const result = invoke([
      "update",
      "first",
      "--force",
      "--json",
      ...(preview ? ["--dry-run"] : []),
    ]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.output).tap_reexpand_rows).toContainEqual(
      expect.objectContaining({ name: "shared", kind: preview ? "would_add" : "added" }),
    );
    expect(readState(home).installations.some((e) => e.name === "shared")).toBe(!preview);
  });
}
