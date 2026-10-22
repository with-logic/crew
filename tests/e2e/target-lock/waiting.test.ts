/** One successful waiting CLI contender must read ownership after the holder publishes (§14). */
import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { barrierPath, cli, expectLocked, fixture, marker, ready, release } from "./helpers.ts";
import { acquiredBy, letPublish, waitingCli } from "./waiting-process.ts";

for (const detach of [false, true]) {
  test(`C-CONC-06 the same waiting contender observes published owners (detach=${detach})`, async () => {
    const f = fixture();
    const [low, high] = [f.target, makeTempDir()].sort((a, b) => {
      const x = statSync(a, { bigint: true });
      const y = statSync(b, { bigint: true });
      return Number(x.dev - y.dev || x.ino - y.ino);
    }) as [string, string];
    const home = makeCrewHome();
    const bases = { codex: high, "gemini-cli": low };
    if (detach) {
      expect(
        (
          await cli({ ...f, target: high, args: ["install", f.source, "--agent", "claude-code"] })
            .result
        ).exitCode,
      ).toBe(0);
      expect(
        (
          await cli({
            ...f,
            target: high,
            home,
            bases,
            args: ["install", f.source, "--agent", "codex", "--agent", "gemini-cli"],
          }).result
        ).exitCode,
      ).toBe(0);
    }
    const barrier = barrierPath();
    const holder = waitingCli({
      ...f,
      target: high,
      home: makeCrewHome(),
      args: ["install", f.source, "--agent", detach ? "roo-code" : "claude-code"],
      barrier,
    });
    let contender: ReturnType<typeof waitingCli> | undefined;
    try {
      await ready(barrier);
      contender = waitingCli({
        ...f,
        target: high,
        home,
        bases,
        args: detach
          ? ["uninstall", "demo"]
          : ["install", f.source, "--agent", "codex", "--agent", "gemini-cli"],
      });
      expect(await acquiredBy(low, contender.pid)).toBe(true);
      expect(
        Number(readFileSync(join(high, ".crew-target.lock.owner"), "utf8").split(" ")[0]),
      ).toBe(holder.pid);
    } finally {
      letPublish(barrier);
      expect((await holder.result).exitCode).toBe(0);
      if (contender) {
        const result = await contender.result;
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      }
    }
    expect(marker(high).agents).toEqual(
      detach ? ["claude-code", "roo-code"] : ["claude-code", "codex"],
    );
  }, 20_000);
}

for (const customized of [false, true]) {
  test(`C-CONC-07 target exclusion precedes destination safety errors (customized=${customized})`, async () => {
    const f = fixture();
    if (customized)
      expect(
        (await cli({ ...f, args: ["install", f.source, "--agent", "claude-code"] }).result)
          .exitCode,
      ).toBe(0);
    else mkdirSync(join(f.target, "demo"));
    const path = join(f.target, "demo", "SKILL.md");
    writeFileSync(path, "custom local bytes");
    const barrier = barrierPath();
    const holder = cli({ ...f, home: makeCrewHome(), args: [], hold: true, barrier });
    try {
      await ready(barrier);
      expectLocked(
        await cli({ ...f, home: makeCrewHome(), args: ["install", f.source, "--agent", "codex"] })
          .result,
      );
      expect(readFileSync(path, "utf8")).toBe("custom local bytes");
    } finally {
      expect((await release(holder, barrier)).exitCode).toBe(0);
    }
  });
}
