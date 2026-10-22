/** Clone refresh finishes before shared targets are prepared, including recreated roots (§14). */
import { expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "../../../src/config/load.ts";
import { tapClonePath } from "../../../src/core/repo-path.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { barrierPath, cli, expectLocked, fixture, marker, ready, release } from "./helpers.ts";

function localRepo() {
  const root = makeTempDir();
  makeSkill(root, "upstream", skillFrontmatter({ name: "upstream" }));
  makeGitRepo(root);
  return `file://${root}`;
}

test("C-CONC-07 refreshing sources does not hold a previously installed target", async () => {
  const f = fixture();
  expect((await cli({ ...f, args: ["tap", "add", localRepo(), "upstream"] }).result).exitCode).toBe(
    0,
  );
  expect(
    (await cli({ ...f, args: ["install", f.source, "--agent", "claude-code"] }).result).exitCode,
  ).toBe(0);
  const barrier = barrierPath();
  const updater = cli({ ...f, args: ["update"], barrier, pause: "crew: refreshing tap upstream " });
  let updated: Awaited<typeof updater.result>;
  try {
    await ready(barrier);
    const contender = await cli({
      ...f,
      home: makeCrewHome(),
      args: ["install", f.source, "--agent", "codex"],
    }).result;
    expect(contender.exitCode, contender.stdout + contender.stderr).toBe(0);
  } finally {
    updated = await release(updater, barrier);
  }
  expect(updated.exitCode, updated.stdout + updated.stderr).toBe(0);
  expect(updated.stderr.match(/crew: refreshing tap upstream /g)).toHaveLength(1);
  expect(marker(f.target).agents).toEqual(["claude-code", "codex"]);
}, 20_000);

test("C-CONC-07 refresh-recreated project roots enter the complete locked target batch", async () => {
  const f = fixture();
  for (const name of ["first", "second"])
    expect((await cli({ ...f, args: ["tap", "add", localRepo(), name] }).result).exitCode).toBe(0);
  const tap = readConfig(f.home).taps.find((item) => item.name === "first")!;
  const project = tapClonePath(tap, f.home);
  const target = join(project, "owned-target");
  expect(
    (
      await cli({
        ...f,
        cwd: project,
        target,
        args: ["install", f.source, "--scope", "project", "--agent", "claude-code"],
      }).result
    ).exitCode,
  ).toBe(0);
  const statePath = join(f.home, "state.json");
  const before = readFileSync(statePath);
  rmSync(project, { recursive: true });
  writeFileSync(
    join(f.source, "SKILL.md"),
    `${readFileSync(join(f.source, "SKILL.md"), "utf8")}\nnew bytes`,
  );
  const barrier = barrierPath();
  const updater = cli({
    ...f,
    target,
    args: ["update"],
    barrier,
    pause: "crew: refreshing tap second ",
  });
  let holder: ReturnType<typeof cli> | undefined;
  const heldBarrier = barrierPath();
  try {
    await ready(barrier);
    expect(existsSync(project)).toBe(true);
    holder = cli({
      ...f,
      target,
      home: makeCrewHome(),
      args: [],
      hold: true,
      barrier: heldBarrier,
    });
    await ready(heldBarrier);
    const result = await release(updater, barrier);
    expectLocked(result);
    expect(readFileSync(statePath)).toEqual(before);
    expect(existsSync(join(target, "demo"))).toBe(false);
  } finally {
    await release(updater, barrier);
    if (holder) expect((await release(holder, heldBarrier)).exitCode).toBe(0);
  }
  const retry = await cli({ ...f, target, args: ["update"] }).result;
  expect(retry.exitCode, retry.stdout + retry.stderr).toBe(0);
  expect(existsSync(join(target, "demo", ".crew.json"))).toBe(true);
}, 25_000);
