/** Acquisition order and prune-only bases are observed before any removal (§14). */
import { expect, test } from "bun:test";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { barrierPath, cli, expectLocked, fixture, ready, release } from "./helpers.ts";

test("C-CONC-08 reversed requests acquire the lower identity before the held higher identity", async () => {
  const f = fixture();
  const other = makeTempDir();
  const [low, high] = [f.target, other].sort((a, b) => {
    const left = statSync(a, { bigint: true });
    const right = statSync(b, { bigint: true });
    return Number(left.dev - right.dev || left.ino - right.ino);
  }) as [string, string];
  const barrier = barrierPath();
  const holder = cli({ ...f, target: high, args: [], hold: true, barrier });
  try {
    await ready(barrier);
    expect(existsSync(join(low, ".crew-target"))).toBe(false);
    expectLocked(
      await cli({
        ...f,
        home: makeCrewHome(),
        bases: { "claude-code": high, codex: low },
        args: ["install", f.source, "--agent", "claude-code", "--agent", "codex"],
      }).result,
    );
    expect(existsSync(join(low, ".crew-target"))).toBe(true);
    expect(existsSync(join(low, ".crew-target.lock"))).toBe(false);
    for (const base of [low, high]) expect(existsSync(join(base, "demo"))).toBe(false);
  } finally {
    expect((await release(holder, barrier)).exitCode).toBe(0);
  }
}, 20_000);

test("C-CONC-07 prune-only base contention precedes root, dependency and state mutation", async () => {
  const f = fixture();
  const second = makeTempDir();
  const bases = { "claude-code": f.target, codex: second };
  const dep = makeSkill(f.sourceRoot, "dep", skillFrontmatter({ name: "dep" }));
  const root = makeSkill(
    f.sourceRoot,
    "root",
    skillFrontmatter({ name: "root", dependencies: [dep] }),
  );
  expect(
    (await cli({ ...f, bases, args: ["install", root, "--agent", "claude-code"] }).result).exitCode,
  ).toBe(0);
  // Add another owner without promoting the dependency's explicit state bit.
  expect(
    (
      await cli({ ...f, bases, home: makeCrewHome(), args: ["install", dep, "--agent", "codex"] })
        .result
    ).exitCode,
  ).toBe(0);
  const statePath = join(f.home, "state.json");
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const dependency = state.installations.find((entry: { name: string }) => entry.name === "dep");
  expect(dependency.explicit).toBe(false);
  dependency.agents.push("codex");
  writeFileSync(statePath, JSON.stringify(state));
  const paths = [statePath];
  for (const dir of [join(f.target, "root"), join(f.target, "dep"), join(second, "dep")])
    for (const name of ["SKILL.md", ".crew.json"]) paths.push(join(dir, name));
  const before = paths.map((path) => readFileSync(path));
  const barrier = barrierPath();
  const holder = cli({ ...f, target: second, home: makeCrewHome(), args: [], hold: true, barrier });
  const args = ["uninstall", "root", "--prune"];
  try {
    await ready(barrier);
    expectLocked(await cli({ ...f, bases, args }).result);
    for (const [index, path] of paths.entries()) expect(readFileSync(path)).toEqual(before[index]!);
  } finally {
    expect((await release(holder, barrier)).exitCode).toBe(0);
  }
  const retry = await cli({ ...f, bases, args }).result;
  expect(retry.exitCode, retry.stdout + retry.stderr).toBe(0);
  for (const path of [join(f.target, "root"), join(f.target, "dep"), join(second, "dep")])
    expect(existsSync(path)).toBe(false);
  expect(JSON.parse(readFileSync(statePath, "utf8")).installations).toEqual([]);
}, 20_000);
