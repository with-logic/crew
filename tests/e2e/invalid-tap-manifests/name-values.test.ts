/** Configured search keeps invalid name values out of warnings (§9, §16.6). */

import { expect, test } from "bun:test";
import { makeSkill, skillFrontmatter } from "../../helpers/fixtures.ts";
import { searchFixture } from "./helpers.ts";

for (const [name, reason] of [
  ["person@example.com", "`name` has invalid characters"],
  ["sk_live_PRIVATE_123", "`name` has invalid characters"],
  ["private-token-", "`name` ends with a hyphen"],
  ["private--token", "`name` contains `--`"],
] as const) {
  test(`C-TAP-08d search warnings omit invalid name values: ${reason}`, () => {
    const f = searchFixture();
    const rejected = makeSkill(f.root, "rejected-location", skillFrontmatter({ name }));
    makeSkill(f.root, "healthy-location", skillFrontmatter({ name: "declared-healthy" }));

    const json = f.search(["--json", "--tap", "local"]);
    expect(json.code).toBe(0);
    expect(json.err).toBe("");
    const parsed = JSON.parse(json.out);
    expect(parsed.hits.map((hit: { name: string }) => hit.name)).toEqual(["declared-healthy"]);
    expect(parsed.warnings).toHaveLength(1);
    const warning = parsed.warnings[0];
    expect(warning).toContain("local");
    expect(warning).toContain(rejected);
    expect(warning).toContain("invalid_skill");

    const human = f.search(["--tap", "local"]);
    expect(human.code).toBe(0);
    expect(human.out).toContain("declared-healthy");
    expect(human.out).not.toContain("rejected-location");
    expect(human.err).toContain(warning);
    expect(warning).not.toContain(name);
    expect(human.err).not.toContain(name);
    expect(warning).toContain(reason);
  });
}
