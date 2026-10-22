/** Deterministic physical-base batches unwind timeouts and preserve read-only behavior (§14). */
import { expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { barrierPath, cli, expectLocked, fixture, marker, ready, release } from "./helpers.ts";

test("C-CONC-08 reversed target batches time out before any publication and release acquired bases", async () => {
  const f = fixture();
  const other = makeTempDir("crew-target-other-");
  const [low, high] = [f.target, other].sort((a, b) =>
    Number(statSync(a).ino - statSync(b).ino),
  ) as [string, string];
  const barrier = barrierPath();
  const holder = cli({ ...f, target: high, home: makeCrewHome(), args: [], hold: true, barrier });
  const args = ["install", f.source, "--agent", "claude-code", "--agent", "codex"];
  const bases = { "claude-code": high, codex: low };
  try {
    await ready(barrier);
    expectLocked(await cli({ ...f, bases, args }).result);
    for (const base of [low, high]) expect(existsSync(join(base, "demo"))).toBe(false);
    expect(existsSync(join(low, ".crew-target.lock"))).toBe(false);
    expect(
      (
        await cli({
          ...f,
          target: low,
          home: makeCrewHome(),
          args: ["install", f.source, "--agent", "gemini-cli"],
        }).result
      ).exitCode,
    ).toBe(0);
  } finally {
    expect((await release(holder, barrier)).exitCode).toBe(0);
  }
  expect((await cli({ ...f, bases, args }).result).exitCode).toBe(0);
  const reverse = { "claude-code": low, codex: high };
  expect((await cli({ ...f, bases: reverse, home: makeCrewHome(), args }).result).exitCode).toBe(0);
  expect(marker(high).agents).toEqual(["claude-code", "codex"]);
  expect(marker(low).agents).toEqual(["claude-code", "codex", "gemini-cli"]);
}, 20_000);

for (const args of [
  ["list"],
  ["agents"],
  ["install", "SOURCE", "--agent", "claude-code", "--dry-run"],
  ["update", "--dry-run"],
  ["uninstall", "demo", "--force", "--dry-run"],
  ["doctor", "--repair", "--dry-run"],
]) {
  test(`C-CONC-09 ${args.join(" ")} creates no target coordination artifacts`, async () => {
    const f = fixture();
    const result = await cli({ ...f, args: args.map((arg) => (arg === "SOURCE" ? f.source : arg)) })
      .result;
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    for (const name of [".crew-target", ".crew-target.lock", ".crew-target.lock.owner"])
      expect(existsSync(join(f.target, name))).toBe(false);
    expect(existsSync(join(f.target, "demo"))).toBe(false);
  });
}
