/**
 * Best-effort cleanup after a failure (§9 step 8, §10.1.1 step 2;
 * C-SPEC-16, C-UPD-18e): `removeEach` tries every path and names each one
 * crew couldn't remove; `appendLeftBehind` names those beside the failure,
 * which stays the same error — its code and details untouched.
 */

import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CrewError } from "../../src/core/errors.ts";
import { appendLeftBehind, removeEach } from "../../src/util/cleanup.ts";
import { makeTempDir } from "../helpers/fixtures.ts";

test("removeEach removes what it can and names each path it couldn't", () => {
  const root = makeTempDir();
  const sealed = join(root, "sealed");
  const [stuck, gone] = [join(sealed, "stuck"), join(root, "gone")];
  mkdirSync(stuck, { recursive: true });
  mkdirSync(gone);
  chmodSync(sealed, 0o555);
  let left: string[];
  try {
    left = removeEach([stuck, gone]);
  } finally {
    chmodSync(sealed, 0o755);
  }
  expect(left).toEqual([`\`${stuck}\` (crew couldn't remove it — EACCES: permission denied)`]);
  expect([existsSync(stuck), existsSync(gone)]).toEqual([true, false]);
});

test("appendLeftBehind names what was left on the same failure, its code and details its own", () => {
  const failure = new CrewError("source_unreachable", "couldn't read `x`", { path: "x" });
  const same = appendLeftBehind(failure, ["`a` (why)", "`b` (why)"]);
  expect(same).toBe(failure);
  expect([same.code, same.details]).toEqual(["source_unreachable", { path: "x" }]);
  expect(same.message).toBe("couldn't read `x`; left in place: `a` (why), `b` (why)");
});

test("appendLeftBehind leaves the failure unchanged when nothing was left", () => {
  const failure = new Error("boom");
  expect(appendLeftBehind(failure, []).message).toBe("boom");
});
