/**
 * Unit tests for `attribute-bare-name.ts` — especially the legacy
 * `findTapForBareName` branches exercised only via the `info`
 * command and uncommon error paths.
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import type { Config, TapConfig } from "../../src/core/types.ts";
import { findTapForBareName } from "../../src/install/attribute-bare-name.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

function pathTap(path: string, name: string): TapConfig {
  return { name, kind: "path", registered: true, url: "", subpath: "", path };
}

function configWith(...taps: TapConfig[]): Config {
  return {
    taps,
    forced_agents: [],
    disabled_agents: [],
    autoupdate: { enabled: false, interval_seconds: 14400 },
  };
}

describe("findTapForBareName", () => {
  test("zero matches → invalid_ref", () => {
    const root = makeTempDir("fbn-zero-");
    const cfg = configWith(pathTap(root, "core"));
    expect(() => findTapForBareName("ghost", cfg, "/unused")).toThrow(CrewError);
  });

  test("zero matches with empty tap list includes <none>", () => {
    const cfg = configWith();
    try {
      findTapForBareName("ghost", cfg, "/unused");
    } catch (err) {
      expect((err as CrewError).message).toContain("<none>");
      return;
    }
    throw new Error("expected throw");
  });

  test("one match → returns tap", () => {
    const root = makeTempDir("fbn-one-");
    makeSkill(root, "pdf", skillFrontmatter({ name: "pdf" }));
    const cfg = configWith(pathTap(root, "core"));
    const tap = findTapForBareName("pdf", cfg, "/unused");
    expect(tap.name).toBe("core");
  });

  test("multiple tap matches → ambiguous_reference", () => {
    const a = makeTempDir("fbn-multi-a-");
    makeSkill(a, "pdf", skillFrontmatter({ name: "pdf" }));
    const b = makeTempDir("fbn-multi-b-");
    makeSkill(b, "pdf", skillFrontmatter({ name: "pdf" }));
    const cfg = configWith(pathTap(a, "one"), pathTap(b, "two"));
    expect(() => findTapForBareName("pdf", cfg, "/unused")).toThrow(/matches multiple taps/);
  });

  test("skill in two namespaces in SAME tap: counts as one tap match", () => {
    // Legacy caller flattens by tap — the richer resolver is what
    // cares about per-namespace duplication.
    const root = makeTempDir("fbn-same-tap-");
    const skillsDir = join(root, "skills");
    mkdirSync(skillsDir);
    for (const ns of ["a", "b"]) {
      mkdirSync(join(skillsDir, ns));
      makeSkill(join(skillsDir, ns), "dup", skillFrontmatter({ name: "dup" }));
    }
    const cfg = configWith(pathTap(root, "single"));
    const tap = findTapForBareName("dup", cfg, "/unused");
    expect(tap.name).toBe("single");
  });
});
