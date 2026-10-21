/** Permission-blocked tap additions skip unlocked ownership reads and remain retryable (§14). */
import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSkill, makeTempDir, skillFrontmatter } from "../../helpers/fixtures.ts";
import { cli, fixture, marker } from "./helpers.ts";

test("C-CONC-07 C-UPD-38 blocked new-child ownership is not inspected before target failure", async () => {
  const f = fixture();
  const second = makeTempDir("crew-child-blocked-");
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
  const before = readFileSync(join(f.home, "state.json"));
  makeSkill(f.sourceRoot, "newbie", skillFrontmatter({ name: "newbie" }), "incoming child");
  const destination = join(second, "newbie");
  mkdirSync(destination);
  const markerPath = join(destination, ".crew.json");
  writeFileSync(markerPath, "malformed marker must remain unread");
  chmodSync(second, 0o555);
  try {
    const failed = await cli({ ...f, bases, args: ["update", "fixture"] }).result;
    expect(failed.exitCode, failed.stdout + failed.stderr).toBe(1);
    const row = JSON.parse(failed.stdout).tap_reexpand_rows[0];
    expect(row.kind).toBe("tap_error");
    expect(row.error.message).toContain("codex: EACCES");
    expect(row.error.code).not.toBe("name_conflict");
    expect(readFileSync(markerPath, "utf8")).toBe("malformed marker must remain unread");
    expect(existsSync(join(f.target, "newbie"))).toBe(false);
    expect(readFileSync(join(f.home, "state.json"))).toEqual(before);
  } finally {
    chmodSync(second, 0o755);
  }
  const conflict = await cli({ ...f, bases, args: ["update", "fixture", "--force"] }).result;
  expect(conflict.exitCode).toBe(1);
  expect(JSON.parse(conflict.stdout).tap_reexpand_rows[0].error.code).toBe("name_conflict");
  expect(existsSync(join(f.target, "newbie"))).toBe(false);
  rmSync(destination, { recursive: true });
  const retry = await cli({ ...f, bases, args: ["update", "fixture"] }).result;
  expect(retry.exitCode, retry.stdout + retry.stderr).toBe(0);
  expect(marker(f.target, "newbie").agents).toEqual(["claude-code"]);
  expect(marker(second, "newbie").agents).toEqual(["codex"]);
  const state = JSON.parse(readFileSync(join(f.home, "state.json"), "utf8"));
  expect(
    state.installations.find((entry: { name: string }) => entry.name === "newbie").agents,
  ).toEqual(["claude-code", "codex"]);
});
