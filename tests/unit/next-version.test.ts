/** Release-helper version selection; developer tooling outside the PRD CLI contract. */
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const helperPath = fileURLToPath(new URL("../../scripts/next-version.sh", import.meta.url));

function runHelper(
  functionName: "validate_release_target" | "next_release_version",
  ...args: string[]
) {
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

  test.each([
    ["0.10.1", "9223372036854775808.0.0"],
    ["1.0.0", "1.9223372036854775808.0"],
    ["1.0.0", "1.0.9223372036854775808"],
    ["9223372036854775807.9.9", "9223372036854775808.0.0"],
    ["1.9223372036854775807.9", "1.9223372036854775808.0"],
    ["1.0.9223372036854775807", "1.0.9223372036854775808"],
    ["999999999999999999999999999999.9.9", "1000000000000000000000000000000.0.0"],
    ["1.999999999999999999999999999999.9", "1.1000000000000000000000000000000.0"],
    ["1.0.999999999999999999999999999999", "1.0.1000000000000000000000000000000"],
    ["18446744073709551616.9.9", "18446744073709551617.0.0"],
    ["18446744073709551616.1.9", "18446744073709551616.2.0"],
    ["18446744073709551616.18446744073709551616.1", "18446744073709551616.18446744073709551616.2"],
  ])("accepts advancing arbitrary-size target %s -> %s", (current, target) => {
    expect(runHelper("next_release_version", current, target)).toEqual({
      exitCode: 0,
      stdout: `${target}\n`,
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

  test.each([
    ["9223372036854775808.0.0", "9223372036854775807.9.9"],
    ["1.9223372036854775808.0", "1.9223372036854775807.9"],
    ["1.0.9223372036854775808", "1.0.9223372036854775807"],
    ["1000000000000000000000000000000.0.0", "999999999999999999999999999999.9.9"],
    ["1.1000000000000000000000000000000.0", "1.999999999999999999999999999999.9"],
    ["1.0.1000000000000000000000000000000", "1.0.999999999999999999999999999999"],
    ["18446744073709551617.0.0", "18446744073709551616.9.9"],
    ["18446744073709551616.2.0", "18446744073709551616.1.9"],
    ["18446744073709551616.18446744073709551616.2", "18446744073709551616.18446744073709551616.1"],
    ["18446744073709551616.18446744073709551616.2", "18446744073709551616.18446744073709551616.2"],
  ])("rejects non-advancing arbitrary-size target %s -> %s", (current, target) => {
    expect(runHelper("next_release_version", current, target)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: `error: target version ${target} must be greater than current version ${current}\n`,
    });
  });
});
