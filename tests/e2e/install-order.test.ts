/**
 * Install ordering and mixed-outcome exit codes (§9 step 6, §9 step 9).
 *
 * The ordering tests assert on the sequence the resolver produces, not
 * on end state: asserting "both skills exist afterwards" passes even
 * when the order is reversed, which is exactly the regression these
 * guard against (C-DEP-01).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { claudeCodeAdapter } from "../../src/agents/claude-code.ts";
import { runCli } from "../../src/cli/main.ts";
import { defaultConfig } from "../../src/config/defaults.ts";
import { resolveInstallSet } from "../../src/install/resolve/index.ts";
import { captureStreams, makeCrewHome } from "../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../helpers/fixtures.ts";

/** Write a SKILL.md into `dir/<directory>` declaring `name`. */
function writeSkill(
  parent: string,
  directory: string,
  name: string,
  dependencies: readonly string[] = [],
): string {
  const dir = join(parent, directory);
  mkdirSync(dir, { recursive: true });
  const deps =
    dependencies.length === 0
      ? ""
      : `metadata:\n  crew:\n    dependencies:\n${dependencies.map((d) => `      - ${d}`).join("\n")}\n`;
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} skill\n${deps}---\nbody\n`,
  );
  return dir;
}

describe("install order", () => {
  test("C-DEP-01 dependency is ordered before its dependent", () => {
    const home = makeCrewHome();
    const container = makeTempDir();
    writeSkill(container, "dep", "dep");
    writeSkill(container, "root", "root", ["dep"]);

    const resolved = resolveInstallSet([join(container, "root")], defaultConfig(), {
      cwd: container,
      home,
    });
    expect(resolved.skills.map((s) => s.name)).toEqual(["dep", "root"]);
  });

  test("C-DEP-01 ordering holds when the dep's directory differs from its declared name", () => {
    const home = makeCrewHome();
    const container = makeTempDir();
    // Directory `dep-directory`, declared name `dep` — §9 step 4 allows
    // the declared name to differ from the directory it lives in.
    writeSkill(container, "dep-directory", "dep");
    writeSkill(container, "root", "root", [join(container, "dep-directory")]);

    const resolved = resolveInstallSet([join(container, "root")], defaultConfig(), {
      cwd: container,
      home,
    });
    expect(resolved.skills.map((s) => s.name)).toEqual(["dep", "root"]);
  });

  test("C-DEP-08 a dependency cycle still yields every skill exactly once", () => {
    const home = makeCrewHome();
    const container = makeTempDir();
    writeSkill(container, "a", "a", ["b"]);
    writeSkill(container, "b", "b", ["a"]);

    const resolved = resolveInstallSet([join(container, "a")], defaultConfig(), {
      cwd: container,
      home,
    });
    expect([...resolved.skills.map((s) => s.name)].sort()).toEqual(["a", "b"]);
  });

  test("C-DEP-08 acyclic edges around a cycle stay ordered", () => {
    const home = makeCrewHome();
    const container = makeTempDir();
    // `a` and `b` form a cycle; `c` depends on `a` from outside it. Breaking
    // the cycle must not cost `c` its own dependency edge — both members have
    // to precede `c`, not merely appear somewhere in the set.
    writeSkill(container, "a", "a", ["b"]);
    writeSkill(container, "b", "b", ["a"]);
    writeSkill(container, "c", "c", ["a"]);

    const resolved = resolveInstallSet([join(container, "c")], defaultConfig(), {
      cwd: container,
      home,
    });
    const order = resolved.skills.map((s) => s.name);
    expect([...order].sort()).toEqual(["a", "b", "c"]);
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("c"));
  });
});

describe("install mixed outcomes", () => {
  const original = {
    user: claudeCodeAdapter.userPath,
    detect: claudeCodeAdapter.detect,
  };
  let ccRoot = "";

  beforeEach(() => {
    ccRoot = makeTempDir("crew-cc-order-");
    (claudeCodeAdapter as { userPath: () => string }).userPath = () => ccRoot;
    (claudeCodeAdapter as { detect: () => boolean }).detect = () => true;
  });

  afterEach(() => {
    (claudeCodeAdapter as { userPath: () => string }).userPath = original.user;
    (claudeCodeAdapter as { detect: () => boolean }).detect = original.detect;
  });

  test("C-INST-21a two direct roots, one failing everywhere, exits 1 and reports both", () => {
    const home = makeCrewHome();
    const src = makeTempDir();
    makeSkill(src, "good", skillFrontmatter({ name: "good" }));
    makeSkill(src, "blocked", skillFrontmatter({ name: "blocked" }));
    // An untracked directory at the destination makes `blocked` fail on
    // the only selected agent, while `good` still succeeds.
    mkdirSync(join(ccRoot, "blocked"), { recursive: true });
    writeFileSync(join(ccRoot, "blocked", "user-file.txt"), "don't touch me");

    const capture = captureStreams();
    const code = runCli(
      ["install", "--agent", "claude-code", join(src, "good"), join(src, "blocked")],
      { home, streams: capture.streams },
    );

    expect(code).toBe(1);
    const out = capture.stdout();
    expect(out).toContain("good");
    expect(out).toContain("blocked");
    expect(existsSync(join(ccRoot, "good", "SKILL.md"))).toBe(true);
    expect(existsSync(join(ccRoot, "blocked", "user-file.txt"))).toBe(true);
  });
});
