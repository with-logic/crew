/** Native source causes stay private while existing error payloads retain their identity (§9, §10.1, §13). */

import { expect, test } from "bun:test";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeError } from "../../src/cli/output.ts";
import { CrewError } from "../../src/core/errors.ts";
import { loadSkill, loadSkillName } from "../../src/skill/load.ts";
import { hashSourceDirectory } from "../../src/sources/read.ts";
import { readSourceFile } from "../../src/util/source-read.ts";
import { makeStyler } from "../../src/util/term.ts";
import { captureStreams } from "../helpers/env.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

function caught(action: () => unknown): CrewError {
  try {
    return action() as never;
  } catch (err) {
    return err as CrewError;
  }
}

function payload(error: CrewError) {
  const capture = captureStreams();
  writeError(error, true, capture.streams, makeStyler(false));
  return {
    isCrewError: error instanceof CrewError,
    name: error.name,
    code: error.code,
    message: error.message,
    details: error.details,
    remedy: error.remedy,
    exitCode: error.exitCode,
    serialized: JSON.stringify(error),
    cli: capture.stdout(),
  };
}

test("source file normalization preserves the exact native cause non-enumerably", () => {
  const file = join(makeTempDir(), "missing");
  let native: unknown;
  const error = caught(() =>
    readSourceFile(file, (path) => {
      try {
        return readFileSync(path);
      } catch (err) {
        native = err;
        throw err;
      }
    }),
  );
  expect(error.cause).toBe(native);
  expect(Object.getOwnPropertyDescriptor(error, "cause")?.enumerable).toBe(false);
  expect(payload(error)).toEqual(
    payload(
      new CrewError(
        "source_unreachable",
        `cannot read source \`${file}\`: ${(native as Error).message}`,
        { path: file },
        "Check that the source file exists and that you can read it and access its parent directories.",
      ),
    ),
  );
});

test("source directory normalization retains native permission provenance privately", () => {
  const root = makeTempDir();
  writeFileSync(join(root, "asset.txt"), "bytes");
  chmodSync(root, 0o100);
  try {
    const error = caught(() => hashSourceDirectory(root));
    const native = error.cause as NodeJS.ErrnoException;
    expect(native).toBeInstanceOf(Error);
    expect(native.code).toBe("EACCES");
    expect(native.path).toBe(root);
    expect(Object.getOwnPropertyDescriptor(error, "cause")?.enumerable).toBe(false);
    expect(payload(error)).toEqual(
      payload(
        new CrewError(
          "source_unreachable",
          `cannot inspect source \`${root}\`: ${native.message}`,
          { path: root },
          "Check that the source directory can be listed and searched, and that you can access its parent directories.",
        ),
      ),
    );
  } finally {
    chmodSync(root, 0o700);
  }
});

for (const load of [loadSkill, loadSkillName])
  test(`${load.name} missing manifest keeps its exact validation payload`, () => {
    const root = makeTempDir();
    expect(payload(caught(() => load(root)))).toEqual(
      payload(
        new CrewError(
          "invalid_skill",
          `no SKILL.md in \`${root}\` — every skill directory needs one`,
          { path: root },
        ),
      ),
    );
  });
