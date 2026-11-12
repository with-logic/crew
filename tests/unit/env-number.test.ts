/**
 * Numeric settings read from the environment (§14): a value that is
 * not a finite positive number leaves the default in force.
 */

import { afterEach, expect, test } from "bun:test";
import { defaultTimeoutMs } from "../../src/util/advisory-lock.ts";
import { positiveEnvNumber } from "../../src/util/env-number.ts";

const before = process.env["CREW_LOCK_TIMEOUT_MS"];
afterEach(() => {
  if (before === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
  else process.env["CREW_LOCK_TIMEOUT_MS"] = before;
});

test("the lock timeout is 30 seconds when the setting is absent", () => {
  delete process.env["CREW_LOCK_TIMEOUT_MS"];
  expect(defaultTimeoutMs()).toBe(30_000);
});

test.each(["soon", "0", "-5", "", "Infinity"])(
  "the lock timeout stays 30 seconds when the setting is %p",
  (value) => {
    process.env["CREW_LOCK_TIMEOUT_MS"] = value;
    expect(defaultTimeoutMs()).toBe(30_000);
  },
);

test("a finite positive setting replaces the lock timeout", () => {
  process.env["CREW_LOCK_TIMEOUT_MS"] = "250";
  expect(defaultTimeoutMs()).toBe(250);
  expect(positiveEnvNumber("CREW_LOCK_TIMEOUT_MS", 7)).toBe(250);
});
