/** Release-helper version selection; developer tooling outside the PRD CLI contract. */
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const helperPath = fileURLToPath(new URL("../../scripts/next-version.sh", import.meta.url));

function runHelper(functionName: string, ...args: string[]) {
  const result = Bun.spawnSync([
    "bash",
    "-c",
    'source "$1" && shift && "$@"',
    "release-version-test",
    helperPath,
    functionName,
    ...args,
  ]);
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("release version selection", () => {
  test.each(["patch", "minor", "major", "0.12.0", "1.0.0"])("accepts target %s", (target) => {
    expect(runHelper("validate_release_target", target)).toEqual({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  });

  test.each([
    "",
    "next",
    "v0.12.0",
    "0.12",
    "0.12.0.1",
    "00.12.0",
    "0.012.0",
    "0.12.00",
    "0.12.0-rc.1",
    "0.12.0+build",
    "-1.0.0",
  ])("rejects invalid target %s", (target) => {
    const result = runHelper("validate_release_target", target);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("expected patch|minor|major or a canonical stable version");
  });

  test.each([
    ["0.10.1", "patch", "0.10.2"],
    ["0.10.1", "minor", "0.11.0"],
    ["0.10.1", "major", "1.0.0"],
    ["0.10.1", "0.12.0", "0.12.0"],
    ["0.10.1", "0.10.2", "0.10.2"],
    ["0.10.1", "2.0.0", "2.0.0"],
  ])("selects %s + %s as %s", (current, target, expected) => {
    expect(runHelper("next_release_version", current, target)).toEqual({
      exitCode: 0,
      stdout: `${expected}\n`,
      stderr: "",
    });
  });

  test("defaults to a patch bump", () => {
    expect(runHelper("next_release_version", "0.10.1")).toEqual({
      exitCode: 0,
      stdout: "0.10.2\n",
      stderr: "",
    });
  });

  test.each(["0.10.1", "0.10.0", "0.9.99"])("rejects non-advancing target %s", (target) => {
    const result = runHelper("next_release_version", "0.10.1", target);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("must be greater than current version 0.10.1");
  });
});
