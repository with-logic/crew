/** C-STATE-16 install discovery upgrades aggregate retained-root warnings (§9, §11.1). */
import { expect, test } from "bun:test";
import { WARNING, withFixture } from "./fixture.ts";

test("C-STATE-16 one install warns once across two upgrades even when already installed", () => {
  withFixture(true, (f) => {
    const result = f.run(["install", "--recursive", ...f.sources]);
    expect(result.code).toBe(0);
    f.assertLocations("tap-a", true);
    expect(f.betaMarker().tap_discovery).toBe("recursive");
    expect(result.stdout).toContain("already installed");
    expect(result.stderr).toBe(WARNING);
    expect(f.run(["install", "--recursive", ...f.sources]).stderr).toBe("");
  });
});

for (const flags of [["--quiet"], ["--json"], ["--json", "--quiet"]]) {
  test(`C-STATE-16 install warning preserves ${flags.join(" ")} result cardinality`, () => {
    withFixture(true, (f) => {
      const result = f.run(["install", "--recursive", ...flags, ...f.sources]);
      expect(result.code).toBe(0);
      f.assertLocations("tap-a", true);
      if (flags.includes("--json")) {
        const json = JSON.parse(result.stdout);
        expect(Object.keys(json).sort()).toEqual([
          "already_installed",
          "dry_run",
          "records",
          "skipped",
        ]);
        expect(json.already_installed).toHaveLength(2);
        expect(json.records).toEqual([]);
        expect(json.skipped).toEqual([]);
        expect(json.dry_run).toBe(false);
        expect(result.stderr).toBe("");
      } else {
        expect(result.stdout).toBe("");
        expect(result.stderr).toBe(WARNING);
      }
    });
  });
}

test("C-STATE-16 ordinary install and dry-run discovery upgrade remain silent", () => {
  withFixture(true, (f) => {
    expect(f.run(["install", ...f.sources]).stderr).toBe("");
    const before = f.snapshot();
    expect(f.run(["install", "--recursive", "--dry-run", ...f.sources]).stderr).toBe("");
    expect(f.snapshot()).toEqual(before);
    f.assertLocations("tap-a", false);
  });
});
