/** Later manifest lstat failures warn without losing healthy search hits (§16.6). */

import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { collectConfiguredHits } from "../../../src/commands/search/configured.ts";
import { CrewError } from "../../../src/core/errors.ts";
import type { StateSource, TapConfig } from "../../../src/core/types.ts";
import { indexTap } from "../../../src/install/tap-index.ts";
import { loadSkill, loadSkillName } from "../../../src/skill/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

/** Mutate real permissions through the existing public installed-index input. */
class TraversalBoundaryMap extends Map<string, readonly StateSource[]> {
  readonly lookups: string[] = [];

  readonly afterIndex: () => void;

  constructor(afterIndex: () => void) {
    super();
    this.afterIndex = afterIndex;
  }

  override get(name: string): readonly StateSource[] | undefined {
    this.lookups.push(name);
    if (this.lookups.length === 1) this.afterIndex();
    return super.get(name);
  }
}

for (const query of ["", "needle"]) {
  test(`C-TAP-08f later native lstat denial warns (${query || "catalog"})`, () => {
    const home = makeCrewHome();
    const root = makeTempDir("crew-later-lstat-\n\x1b\x85");
    const tap: TapConfig = {
      name: "local\nhttps://private-token@example.invalid/tap?token=private-query",
      kind: "path",
      registered: true,
      path: root,
      url: "",
      subpath: "",
    };
    for (const name of ["alpha", "beta", "gamma"]) {
      makeSkill(root, name, skillFrontmatter({ name, description: "needle in description" }));
    }
    const locations = [...indexTap(tap, home).skills.values()].flat();
    expect(locations).toHaveLength(3);
    const [first, blocked, last] = [locations[0]!, locations[1]!, locations[2]!];
    const manifest = join(blocked.path, "SKILL.md");
    const installed = new TraversalBoundaryMap(() => {
      expect(installed.lookups).toEqual([first.name]);
      expect(loadSkillName(blocked.path)).toBe(blocked.name);
      // Name indexing has finished; directory traversal now fails at native lstat.
      chmodSync(blocked.path, 0);
    });
    try {
      const result = collectConfiguredHits([tap], query, { sourcesByName: installed }, home);
      expect(installed.lookups).toEqual([first.name, last.name]);
      expect(result.hits.map((hit) => hit.name)).toEqual([first.name, last.name].sort());
      for (const hit of result.hits) {
        expect(hit.tap).toBe(tap.name);
        expect(hit.description).toBe("needle in description");
        expect(hit.installed).toBe(false);
        expect(hit.same_name_installed).toBe(false);
        expect(hit.namespace).toBeNull();
      }
      let nativeFailure: unknown;
      try {
        loadSkill(blocked.path);
      } catch (err) {
        nativeFailure = err;
      }
      expect(nativeFailure).toMatchObject({ code: "EACCES", syscall: "lstat", path: manifest });
      expect(nativeFailure).not.toBeInstanceOf(CrewError);
      expect(result.warnings).toHaveLength(1);
      const warning = result.warnings[0]!;
      expect(warning).toContain(`skill \`${blocked.name}\``);
      expect(warning).toContain("source_unreachable");
      expect(warning).toContain("EACCES");
      expect(warning).toContain("lstat");
      expect(warning).toContain(
        manifest.replaceAll("\n", "\\x0a").replaceAll("\x1b", "\\x1b").replaceAll("\x85", "\\x85"),
      );
      expect(warning).toContain("local\\x0a");
      for (const omitted of [
        "\n",
        "\x1b",
        "\x85",
        "private-token",
        "private-query",
        "back online",
        "cloned yet",
        "crew tap update",
        "Check that the source file",
      ]) {
        expect(warning).not.toContain(omitted);
      }
    } finally {
      chmodSync(blocked.path, 0o700);
      expect(loadSkill(blocked.path).frontmatter.name).toBe(blocked.name);
    }
  });
}
