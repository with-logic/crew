/**
 * Failure codes (§13). `failureCodeOf`: a per-agent failure's code is a
 * §13 name, or a filesystem error's errno code — never another library's
 * `code`. `crewErrorNameOf`: a failure about the source is always a §13
 * name — a filesystem error is `source_unreachable`, anything else the
 * caller's fallback.
 */

import { expect, test } from "bun:test";
import { CrewError } from "../../src/core/errors.ts";
import { crewErrorNameOf, failureCodeOf } from "../../src/util/errno.ts";

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

test("crewErrorNameOf keeps a CrewError's §13 name", () => {
  expect(crewErrorNameOf(new CrewError("invalid_skill", "x"), "usage_error")).toBe("invalid_skill");
});

test("crewErrorNameOf reports a filesystem error as source_unreachable, never its errno code", () => {
  const fs = Object.assign(new Error("EACCES: permission denied"), {
    code: "EACCES",
    syscall: "lstat",
  });
  expect(crewErrorNameOf(fs, "usage_error")).toBe("source_unreachable");
});

test("crewErrorNameOf gives anything else the caller's fallback, whatever its code", () => {
  const other = Object.assign(new Error("x"), { code: "ELOCKED" });
  expect(crewErrorNameOf(other, "no_skills_found")).toBe("no_skills_found");
  expect(crewErrorNameOf("thrown text", "usage_error")).toBe("usage_error");
});
