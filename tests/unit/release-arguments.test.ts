/** Release argument parsing; developer tooling outside the PRD CLI contract. */
import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const versionHelper = fileURLToPath(new URL("../../scripts/next-version.sh", import.meta.url));
const argumentHelper = fileURLToPath(
  new URL("../../scripts/release/arguments.sh", import.meta.url),
);

function runParser(...args: string[]) {
  const result = Bun.spawnSync([
    "bash",
    "-euo",
    "pipefail",
    "-c",
    'source "$1"; source "$2"; shift 2; parse_release_arguments "$@"; printf "%s\\n%s\\n" "$RELEASE_TARGET" "$DRY_RUN"',
    "release-arguments-test",
    versionHelper,
    argumentHelper,
    ...args,
  ]);
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

describe("release argument parsing", () => {
  test("sourcing only defines the parser without changing arguments or producing output", () => {
    const result = Bun.spawnSync([
      "bash",
      "-euo",
      "pipefail",
      "-c",
      'arguments_helper="$1"; set -- sentinel-one "sentinel two"; RELEASE_TARGET=minor; DRY_RUN=true; source "$arguments_helper"; declare -F parse_release_arguments >/dev/null; [[ "$RELEASE_TARGET" == minor && "$DRY_RUN" == true && "$#" -eq 2 && "$1" == sentinel-one && "$2" == "sentinel two" ]]',
      "release-arguments-source-test",
      argumentHelper,
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toBe("");
  });

  test.each([
    [[], "patch", false],
    [["patch"], "patch", false],
    [["minor"], "minor", false],
    [["major"], "major", false],
    [["0.12.0"], "0.12.0", false],
    [["9223372036854775808.0.0"], "9223372036854775808.0.0", false],
    [["--dry-run"], "patch", true],
    [["--dry-run", "--dry-run"], "patch", true],
    [["--dry-run", "minor"], "minor", true],
    [["minor", "--dry-run"], "minor", true],
    [["--dry-run", "0.12.0", "--dry-run"], "0.12.0", true],
  ] as const)("parses %j", (args, target, dryRun) => {
    expect(runParser(...args)).toEqual({
      exitCode: 0,
      stdout: `${target}\n${dryRun}\n`,
      stderr: "",
    });
  });

  test.each([
    [["patch", "minor"]],
    [["minor", "patch"]],
    [["0.12.0", "patch"]],
    [["patch", "0.12.0"]],
    [["patch", "patch"]],
    [["0.12.0", "0.12.0"]],
    [["0.12.0", "1.0.0"]],
    [["--dry-run", "major", "--dry-run", "minor"]],
  ] as const)("rejects multiple valid targets %j", (args) => {
    expect(runParser(...args)).toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "error: expected at most one release target\n",
    });
  });

  test.each([
    [["next"]],
    [["v0.12.0"]],
    [["0.012.0"]],
    [["0.12.0-rc.1"]],
    [["0.12.0+build"]],
    [["patch", "next"]],
    [["next", "patch"]],
    [["--dry-run", "patch", "--unknown"]],
  ] as const)("preserves invalid-target diagnostics for %j", (args) => {
    const result = runParser(...args);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("error: unknown argument '");
    expect(result.stderr).toContain("expected patch|minor|major or a canonical stable version");
    expect(result.stderr).not.toContain("at most one release target");
  });
});
