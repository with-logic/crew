/**
 * `failureCodeOf` (§13): a per-agent failure's code is a §13 name, or a
 * filesystem error's errno code — never another library's `code`.
 */

import { expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { failureCodeOf } from "../../src/util/errno.ts";

test("a CrewError keeps its §13 name; a filesystem error its errno code", () => {
  expect(failureCodeOf(new CrewError("customized", "x"))).toBe("customized");
  const fs = Object.assign(new Error("EACCES: permission denied"), {
    code: "EACCES",
    syscall: "open",
  });
  expect(failureCodeOf(fs)).toBe("EACCES");
});

test("another error's code, without a syscall, is not passed through", () => {
  expect(failureCodeOf(Object.assign(new Error("x"), { code: "ELOCKED" }))).toBe("usage_error");
});
