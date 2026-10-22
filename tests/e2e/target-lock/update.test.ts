/** Reinstall, child-source preflight and rollback stay inside target exclusion (§10.1, §14). */
import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { barrierPath, cli, expectLocked, fixture, marker, ready, release } from "./helpers.ts";

for (const child of [false, true]) {
  test(`C-CONC-07 update protects ${child ? "new-child source preflight" : "existing reinstall"}`, async () => {
    const f = fixture();
    expect(
      (await cli({ ...f, args: ["tap", "add", f.sourceRoot, "fixture"] }).result).exitCode,
    ).toBe(0);
    expect(
      (await cli({ ...f, args: ["install", "fixture", "--tap", "--agent", "claude-code"] }).result)
        .exitCode,
    ).toBe(0);
    if (child) {
      const foreign = makeSkill(
        makeTempDir(),
        "newbie",
        skillFrontmatter({ name: "newbie" }),
        "foreign bytes",
      );
      expect(
        (
          await cli({
            ...f,
            home: makeCrewHome(),
            args: ["install", foreign, "--agent", "claude-code"],
          }).result
        ).exitCode,
      ).toBe(0);
      makeSkill(f.sourceRoot, "newbie", skillFrontmatter({ name: "newbie" }), "incoming bytes");
    } else
      writeFileSync(
        join(f.source, "SKILL.md"),
        `${readFileSync(join(f.source, "SKILL.md"), "utf8")}\nupdated bytes`,
      );
    const name = child ? "newbie" : "demo";
    const before = readFileSync(join(f.target, name, "SKILL.md"));
    const barrier = barrierPath();
    const holder = cli({ ...f, home: makeCrewHome(), args: [], hold: true, barrier });
    try {
      await ready(barrier);
      expectLocked(await cli({ ...f, args: ["upgrade", "fixture"] }).result);
      expect(readFileSync(join(f.target, name, "SKILL.md"))).toEqual(before);
    } finally {
      expect((await release(holder, barrier)).exitCode).toBe(0);
    }
    const retried = await cli({ ...f, args: ["update", "fixture"] }).result;
    expect(retried.exitCode, retried.stdout + retried.stderr).toBe(child ? 1 : 0);
    if (child) {
      expect(JSON.parse(retried.stdout).tap_reexpand_rows[0].error.code).toBe("name_conflict");
      expect(readFileSync(join(f.target, name, "SKILL.md"))).toEqual(before);
    } else
      expect(readFileSync(join(f.target, name, "SKILL.md"), "utf8")).toContain("updated bytes");
  }, 20_000);
}

test("C-CONC-07 new-child targets stay excluded until failed publication rolls back", async () => {
  const f = fixture();
  const second = makeTempDir("crew-target-second-");
  const bases = { "claude-code": f.target, codex: second };
  expect(
    (await cli({ ...f, bases, args: ["tap", "add", f.sourceRoot, "fixture"] }).result).exitCode,
  ).toBe(0);
  expect(
    (
      await cli({
        ...f,
        bases,
        args: ["install", "fixture", "--tap", "--agent", "claude-code", "--agent", "codex"],
      }).result
    ).exitCode,
  ).toBe(0);
  const added = makeSkill(
    f.sourceRoot,
    "newbie",
    skillFrontmatter({ name: "newbie" }),
    "new child bytes",
  );
  const barrier = barrierPath();
  const a = cli({
    ...f,
    bases,
    args: ["update", "fixture"],
    barrier,
    pause: `crew: installing newbie → ${second}/`,
    removeStaged: "newbie",
  });
  const other = { ...f, home: makeCrewHome(), args: ["install", added, "--agent", "claude-code"] };
  let resultA: Awaited<ReturnType<typeof cli>["result"]>;
  try {
    await ready(barrier);
    expect(marker(f.target, "newbie").agents).toEqual(["claude-code"]);
    expectLocked(await cli(other).result);
  } finally {
    resultA = await release(a, barrier);
  }
  expect(resultA.exitCode, resultA.stdout + resultA.stderr).toBe(1);
  expect(existsSync(join(f.target, "newbie"))).toBe(false);
  expect(existsSync(join(second, "newbie"))).toBe(false);
  expect((await cli(other).result).exitCode).toBe(0);
  expect(marker(f.target, "newbie").agents).toEqual(["claude-code"]);
}, 20_000);
