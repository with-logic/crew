/** Every removal and metadata-only writer joins shared target exclusion (§14). */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { barrierPath, cli, expectLocked, fixture, marker, ready, release } from "./helpers.ts";

for (const writer of ["uninstall", "rm", "untap", "promote", "discovery", "reattribute"] as const) {
  test(`C-CONC-07 ${writer} waits before touching shared markers`, async () => {
    const f = fixture();
    if (writer === "discovery")
      expect((await cli({ ...f, args: ["tap", "add", f.source, "fixture"] }).result).exitCode).toBe(
        0,
      );
    expect(
      (await cli({ ...f, args: ["install", f.source, "--agent", "claude-code"] }).result).exitCode,
    ).toBe(0);
    const before = marker(f.target);
    const args =
      writer === "promote"
        ? ["tap", "add", f.source, "fixture"]
        : writer === "discovery"
          ? ["tap", "add", f.source, "fixture", "--recursive"]
          : writer === "reattribute"
            ? ["install", f.sourceRoot, "--agent", "claude-code"]
            : writer === "untap"
              ? ["untap", before.tap_name, "--uninstall"]
              : [writer, "demo", "--prune"];
    const barrier = barrierPath();
    const holder = cli({ ...f, home: makeCrewHome(), args: [], hold: true, barrier });
    try {
      await ready(barrier);
      expectLocked(await cli({ ...f, args }).result);
      expect(marker(f.target)).toEqual(before);
    } finally {
      expect((await release(holder, barrier)).exitCode).toBe(0);
    }
    const retried = await cli({ ...f, args }).result;
    expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
    if (writer === "promote") expect(marker(f.target).tap_name).toBe("fixture");
    else if (writer === "discovery") expect(marker(f.target).tap_discovery).toBe("recursive");
    else if (writer === "reattribute") expect(marker(f.target).tap_path).toBe(f.sourceRoot);
    else expect(existsSync(join(f.target, "demo"))).toBe(false);
  }, 20_000);
}
