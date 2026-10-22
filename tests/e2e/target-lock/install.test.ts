/** Cross-home install and in-place detach preserve the latest marker owners (§14). */
import { expect, test } from "bun:test";
import { existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { barrierPath, cli, expectLocked, fixture, marker, ready, release } from "./helpers.ts";

for (const scope of ["user", "project"] as const) {
  test(`C-CONC-06 cross-home ${scope} install preserves both owners through a base alias`, async () => {
    const f = fixture();
    const homeB = makeCrewHome();
    const alias = join(makeTempDir(), "alias");
    symlinkSync(f.target, alias);
    const barrier = barrierPath();
    const a = cli({
      ...f,
      args: ["install", f.source, "--agent", "claude-code", "--scope", scope],
      barrier,
      pause: "crew: installing ",
    });
    const inputB = {
      ...f,
      home: homeB,
      target: scope === "project" ? alias : f.target,
      args: ["install", f.source, "--agent", "codex", "--scope", scope],
    };
    let resultA: Awaited<ReturnType<typeof cli>["result"]>;
    try {
      await ready(barrier);
      expect(existsSync(join(f.target, "demo"))).toBe(false);
      expectLocked(await cli(inputB).result);
      expect(existsSync(join(f.target, "demo"))).toBe(false);
    } finally {
      resultA = await release(a, barrier);
    }
    expect(resultA.exitCode, resultA.stdout + resultA.stderr).toBe(0);
    expect((await cli(inputB).result).exitCode).toBe(0);
    expect(marker(f.target).agents).toEqual(["claude-code", "codex"]);
  }, 20_000);
}

test("C-CONC-06 cross-home detach merges a later attachment after exclusion", async () => {
  const f = fixture();
  expect(
    (
      await cli({ ...f, args: ["install", f.source, "--agent", "claude-code", "--agent", "codex"] })
        .result
    ).exitCode,
  ).toBe(0);
  const barrier = barrierPath();
  const a = cli({
    ...f,
    args: ["uninstall", "demo", "--agent", "codex"],
    barrier,
    pause: "crew: removing ",
  });
  const inputB = {
    ...f,
    home: makeCrewHome(),
    args: ["install", f.source, "--agent", "gemini-cli"],
  };
  let resultA: Awaited<ReturnType<typeof cli>["result"]>;
  try {
    await ready(barrier);
    expectLocked(await cli(inputB).result);
    expect(marker(f.target).agents).toEqual(["claude-code", "codex"]);
  } finally {
    resultA = await release(a, barrier);
  }
  expect(resultA.exitCode).toBe(0);
  expect((await cli(inputB).result).exitCode).toBe(0);
  expect(marker(f.target).agents).toEqual(["claude-code", "gemini-cli"]);
}, 20_000);
