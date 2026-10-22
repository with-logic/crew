/** Later directory-manifest read failures warn without dropping healthy hits (§16.6). */

import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { collectConfiguredHits } from "../../../src/commands/search/configured.ts";
import type { StateSource, TapConfig } from "../../../src/core/types.ts";
import { indexTap } from "../../../src/install/tap-index.ts";
import { loadSkill, loadSkillName } from "../../../src/skill/load.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";

/** Public caller-input boundary; actual file reads and chmod remain unmocked. */
class PermissionBoundaryMap extends Map<string, readonly StateSource[]> {
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

for (const [query, controlled] of [
  ["", false],
  ["needle", false],
  ["needle", true],
] as const) {
  test(`C-TAP-08f later read denial preserves healthy surrounding hits (${query || "catalog"}, controls=${controlled})`, () => {
    const home = makeCrewHome();
    const root = makeTempDir(controlled ? "crew-later-read-\n\x1b\x85" : "crew-later-read-");
    const tap: TapConfig = {
      name: controlled
        ? "local\nhttps://private-token@example.invalid/tap?token=private-query"
        : "local",
      kind: "path",
      registered: true,
      path: root,
      url: "",
      subpath: "",
    };
    for (const name of ["alpha", "beta", "gamma"]) {
      makeSkill(root, name, skillFrontmatter({ name, description: "needle in description" }));
    }
    // Read actual discovery order rather than assuming filesystem ordering.
    const locations = [...indexTap(tap, home).skills.values()].flat();
    expect(locations).toHaveLength(3);
    const [first, blocked, last] = [locations[0]!, locations[1]!, locations[2]!];
    const manifest = join(blocked.path, "SKILL.md");
    const installed = new PermissionBoundaryMap(() => {
      // collectConfiguredHits finishes its own name index before installed lookup.
      expect(installed.lookups).toEqual([first.name]);
      expect(loadSkillName(blocked.path)).toBe(blocked.name);
      chmodSync(manifest, 0);
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
        if (query) expect(hit.name).not.toContain(query);
      }
      expect(() => loadSkill(blocked.path)).toThrow(
        expect.objectContaining({ code: "source_unreachable", details: { path: manifest } }),
      );
      expect(() => loadSkill(blocked.path)).toThrow("EACCES");
      expect(result.warnings).toHaveLength(1);
      const warning = result.warnings[0]!;
      expect(warning).toContain(`skill \`${blocked.name}\``);
      expect(warning).toContain("source_unreachable");
      expect(warning).toContain("EACCES");
      expect(warning).toContain(
        "; next step: Check that the source file exists and that you can read it and access its parent directories.",
      );
      expect(warning).toContain(
        controlled
          ? manifest
              .replaceAll("\n", "\\x0a")
              .replaceAll("\x1b", "\\x1b")
              .replaceAll("\x85", "\\x85")
          : manifest,
      );
      expect(warning).toContain(controlled ? "local\\x0a" : "local");
      for (const omitted of [
        "\n",
        "\x1b",
        "\x85",
        "private-token",
        "private-query",
        "back online",
        "cloned yet",
        "crew tap update",
      ]) {
        expect(warning).not.toContain(omitted);
      }
    } finally {
      chmodSync(manifest, 0o600);
      expect(loadSkill(blocked.path).frontmatter.name).toBe(blocked.name);
    }
  });
}
