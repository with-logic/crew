/** Shell file-size enforcement; developer tooling outside the PRD CLI contract. */
import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTempDir } from "../helpers/fixtures.ts";

const checker = fileURLToPath(new URL("../../scripts/check-file-size.ts", import.meta.url));

test.each([
  [199, 0],
  [200, 1],
])("checks a shell file containing %i newline characters", (lines, exitCode) => {
  const cwd = makeTempDir("crew-shell-size-");
  mkdirSync(join(cwd, "scripts"));
  writeFileSync(join(cwd, "scripts", "fixture.sh"), "# shell fixture\n".repeat(lines));
  const result = Bun.spawnSync([
    process.execPath,
    "-e",
    "process.chdir(process.argv[1]); await import(process.argv[2]);",
    cwd,
    checker,
  ]);
  expect(result.exitCode).toBe(exitCode);
  if (exitCode === 0) {
    expect(result.stderr.toString()).toBe("");
    expect(result.stdout.toString()).toContain("is under 200 lines");
  } else {
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toContain("200  scripts/fixture.sh");
  }
});
