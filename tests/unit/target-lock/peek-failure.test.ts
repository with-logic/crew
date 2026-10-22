/** Pre-lock SHA lookup preserves operational failures instead of pretending refs are absent (§14). */
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { tapClonePath } from "../../../src/core/repo-path.ts";
import type { TapConfig } from "../../../src/core/types.ts";
import { peekResolvedSha } from "../../../src/install/update/peek.ts";
import { makeCrewHome } from "../../helpers/env.ts";
import { makeGitRepo, makeTempDir } from "../../helpers/fixtures.ts";

test("C-CONC-07 cheap SHA lookup does not soften a missing working directory", () => {
  const home = makeCrewHome();
  const source = makeTempDir();
  makeGitRepo(source);
  const tap: TapConfig = {
    name: "fixture",
    kind: "git",
    registered: true,
    url: `file://${source}`,
    subpath: "",
    path: "",
  };
  const clone = tapClonePath(tap, home);
  expect(existsSync(clone)).toBe(false);
  let failure: unknown;
  try {
    peekResolvedSha(tap, null, home);
  } catch (err) {
    failure = err;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as NodeJS.ErrnoException).code).toBe("ENOENT");
  expect(existsSync(clone)).toBe(false);
});
