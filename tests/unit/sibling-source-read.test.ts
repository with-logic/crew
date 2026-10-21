/** Sibling dependency lookup preserves source read failures and fallback precedence (§9 step 6, §13). */

import { expect, test } from "bun:test";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeConfig } from "../../src/config/load.ts";
import type { Config, TapConfig } from "../../src/core/types.ts";
import { findSiblingDep } from "../../src/install/dep-resolution/index.ts";
import { resolveInstallSet } from "../../src/install/resolve/index.ts";
import { indexTap } from "../../src/install/tap-index.ts";
import { makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function pathTap(name: string, path: string): TapConfig {
  return { name, kind: "path", registered: true, path, url: "", subpath: "" };
}

function fixture(siblingName: string) {
  const home = makeCrewHome();
  const root = makeTempDir("crew-sibling-read-");
  makeSkill(root, "parent", skillFrontmatter({ name: "parent", dependencies: ["dep"] }));
  const sibling = makeSkill(root, "sibling", skillFrontmatter({ name: siblingName }));
  const fallbackRoot = makeTempDir("crew-sibling-fallback-");
  makeSkill(fallbackRoot, "dep", skillFrontmatter({ name: "dep" }));
  const tap = pathTap("local", root);
  const fallback = pathTap("fallback", fallbackRoot);
  const config: Config = {
    taps: [tap, fallback],
    disabled_agents: [],
    forced_agents: [],
    autoupdate: { enabled: false, interval_seconds: 3600 },
  };
  writeConfig(config, home);
  const parent = { tap, tapRelativePath: "parent" };
  const options = { home, cwd: root };
  return { home, root, sibling, config, parent, options };
}

test("an unreadable sibling is a source failure even with a valid configured fallback", () => {
  const { home, sibling, config, parent, options } = fixture("dep");
  const candidate = resolveInstallSet(["fallback/dep"], config, options);
  expect(candidate.skills.map((skill) => [skill.name, skill.tap.name])).toEqual([
    ["dep", "fallback"],
  ]);
  const configBefore = structuredClone(config);
  const configPath = join(home, "config.yaml");
  const configBytes = readFileSync(configPath, "utf8");
  const manifest = join(sibling, "SKILL.md");
  chmodSync(manifest, 0);
  try {
    expect(() => findSiblingDep(parent, "dep", home, config)).toThrow(
      expect.objectContaining({
        code: "source_unreachable",
        details: { path: manifest },
        message: expect.stringContaining("EACCES"),
      }),
    );
    expect(config).toEqual(configBefore);
    expect(readFileSync(configPath, "utf8")).toBe(configBytes);
  } finally {
    chmodSync(manifest, 0o600);
  }
});

test("parent tap indexing already rejects an unreadable sibling", () => {
  const { home, sibling, parent } = fixture("dep");
  const manifest = join(sibling, "SKILL.md");
  chmodSync(manifest, 0);
  try {
    // Indexing the parent tap happens before its dependency walk (§8.3, §9 step 6).
    expect(() => indexTap(parent.tap, home)).toThrow(
      expect.objectContaining({ code: "source_unreachable", details: { path: manifest } }),
    );
  } finally {
    chmodSync(manifest, 0o600);
  }
});

test("an explicit parent path does not resolve an unreadable sibling from another tap", () => {
  const { root, sibling, config, options } = fixture("dep");
  const manifest = join(sibling, "SKILL.md");
  chmodSync(manifest, 0);
  try {
    expect(() => resolveInstallSet([join(root, "parent")], config, options)).toThrow(
      expect.objectContaining({ code: "source_unreachable", details: { path: manifest } }),
    );
  } finally {
    chmodSync(manifest, 0o600);
  }
});

test("invalid sibling metadata still permits resolution from a configured fallback", () => {
  const { home, config, parent, options } = fixture("Invalid");
  expect(findSiblingDep(parent, "dep", home, config)).toBeNull();
  const resolved = resolveInstallSet(["local/parent"], config, options);
  expect(resolved.skills.map((skill) => [skill.name, skill.tap.name])).toEqual([
    ["dep", "fallback"],
    ["parent", "local"],
  ]);
  expect(resolved.config).toEqual(config);
});

test("C-DEP-02 a valid sibling keeps precedence over a configured fallback", () => {
  const { home, sibling, config, parent, options } = fixture("dep");
  const hit = findSiblingDep(parent, "dep", home, config);
  expect(hit?.loaded).toMatchObject({ path: sibling });
  expect(hit?.tap.name).toBe("local");
  expect(hit?.config).toBe(config);
  const resolved = resolveInstallSet(["local/parent"], config, options);
  expect(resolved.skills.map((skill) => [skill.name, skill.tap.name])).toEqual([
    ["dep", "local"],
    ["parent", "local"],
  ]);
});
