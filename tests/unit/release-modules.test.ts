/** Release module sourcing; developer tooling outside the PRD CLI contract. */
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { makeTempDir } from "../helpers/fixtures.ts";

test.each([
  ["notes.sh", "generate_release_notes"],
  ["artifacts.sh", "write_release_artifacts"],
])("sourcing %s only defines its function", (file, functionName) => {
  const helper = fileURLToPath(new URL(`../../scripts/release/${file}`, import.meta.url));
  const result = Bun.spawnSync(
    [
      "bash",
      "-euo",
      "pipefail",
      "-c",
      `original_path="$1"; original_function="$2"; original_pwd="$PWD"
ROOT=untouched; next_version=untouched; next_tag=untouched
pr_body=untouched; changelog_section=untouched; DRY_RUN=untouched
trap ':' EXIT
original_traps="$(trap -p)"
source "$1"
declare -F "$2" >/dev/null
[[ "$#" == 2 && "$1" == "$original_path" && "$2" == "$original_function" ]]
[[ "$PWD" == "$original_pwd" && "$(trap -p)" == "$original_traps" ]]
[[ "$ROOT" == untouched && "$next_version" == untouched && "$next_tag" == untouched ]]
[[ "$pr_body" == untouched && "$changelog_section" == untouched && "$DRY_RUN" == untouched ]]`,
      "release-module-source-test",
      helper,
      functionName,
    ],
    { cwd: makeTempDir("crew-release-source-") },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe("");
  expect(result.stderr.toString()).toBe("");
});
