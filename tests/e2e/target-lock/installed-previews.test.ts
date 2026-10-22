/** Installed-target previews remain unlocked while another home owns the base (§14, C-CONC-09). */
import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { barrierPath, cli, fixture, marker, ready, release } from "./helpers.ts";

for (const preview of ["update", "uninstall", "tap-remove", "promote", "discovery"] as const) {
  test(`C-CONC-09 installed ${preview} preview ignores a held target lock`, async () => {
    const f = fixture();
    if (preview === "discovery")
      expect((await cli({ ...f, args: ["tap", "add", f.source, "fixture"] }).result).exitCode).toBe(
        0,
      );
    expect(
      (await cli({ ...f, args: ["install", f.source, "--agent", "claude-code"] }).result).exitCode,
    ).toBe(0);
    const before = marker(f.target);
    const state = readFileSync(join(f.home, "state.json"));
    const config = readFileSync(join(f.home, "config.yaml"));
    const installed = readFileSync(join(f.target, "demo", "SKILL.md"));
    writeFileSync(join(f.source, "later.txt"), "a source change for the update preview");
    const args =
      preview === "update"
        ? ["update", "demo"]
        : preview === "uninstall"
          ? ["uninstall", "demo", "--force"]
          : preview === "tap-remove"
            ? ["tap", "remove", before.tap_name, "--uninstall"]
            : [
                "tap",
                "add",
                f.source,
                "fixture",
                ...(preview === "discovery" ? ["--recursive"] : []),
              ];
    const barrier = barrierPath();
    const holder = cli({ ...f, home: makeCrewHome(), args: [], hold: true, barrier });
    try {
      await ready(barrier);
      const result = await cli({ ...f, args: [...args, "--dry-run"] }).result;
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(marker(f.target)).toEqual(before);
      expect(readFileSync(join(f.home, "state.json"))).toEqual(state);
      expect(readFileSync(join(f.home, "config.yaml"))).toEqual(config);
      expect(readFileSync(join(f.target, "demo", "SKILL.md"))).toEqual(installed);
      expect(existsSync(join(f.target, "demo", "later.txt"))).toBe(false);
      expect(existsSync(join(f.target, ".crew-target.lock"))).toBe(true);
    } finally {
      expect((await release(holder, barrier)).exitCode).toBe(0);
    }
    expect(existsSync(join(f.target, ".crew-target.lock"))).toBe(false);
  }, 20_000);
}
