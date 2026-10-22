/** Filtered uninstall admits only removable agents and possible prune bases (§7.4, §14). */
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";
import { barrierPath, cli, fixture, ready, release } from "./helpers.ts";

for (const prune of [false, true]) {
  for (const matching of [false, true]) {
    test(`C-CONC-07 filtered uninstall skips unrelated held bases (prune=${prune}, match=${matching})`, async () => {
      const f = fixture();
      const second = makeTempDir();
      const bases = { "claude-code": f.target, codex: second };
      expect(
        (
          await cli({
            ...f,
            bases,
            args: ["install", f.source, "--agent", "claude-code", "--agent", "codex"],
          }).result
        ).exitCode,
      ).toBe(0);
      const statePath = join(f.home, "state.json");
      const stateBefore = readFileSync(statePath);
      const preserved = matching ? [second] : [f.target, second];
      const files = preserved.flatMap((base) => [
        join(base, "demo", "SKILL.md"),
        join(base, "demo", ".crew.json"),
      ]);
      const before = files.map((file) => readFileSync(file));
      const barrier = barrierPath();
      const holder = cli({
        ...f,
        target: second,
        home: makeCrewHome(),
        args: [],
        hold: true,
        barrier,
      });
      try {
        await ready(barrier);
        const args = ["uninstall", "demo", "--agent", matching ? "claude-code" : "gemini-cli"];
        if (prune) args.push("--prune");
        const result = await cli({ ...f, bases, args }).result;
        expect(result.exitCode, result.stdout + result.stderr).toBe(0);
        for (const [index, file] of files.entries())
          expect(readFileSync(file)).toEqual(before[index]!);
        if (matching) {
          expect(existsSync(join(f.target, "demo"))).toBe(false);
          const state = JSON.parse(readFileSync(statePath, "utf8"));
          expect(state.installations).toHaveLength(1);
          expect(state.installations[0].agents).toEqual(["codex"]);
        } else {
          expect(readFileSync(statePath)).toEqual(stateBefore);
        }
      } finally {
        expect((await release(holder, barrier)).exitCode).toBe(0);
      }
    }, 20_000);
  }
}
