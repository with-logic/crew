/** A failed contender cannot satisfy the lock-publication witness using a stale owner (§14). */
import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixture } from "./helpers.ts";
import { acquiredBy, waitingCli } from "./waiting-process.ts";

test("C-CONC-06 lock witness rejects another process's retained ownership", async () => {
  const f = fixture();
  const owner = join(f.target, ".crew-target.lock.owner");
  const retained = `${process.pid} retained-owner`;
  writeFileSync(owner, retained);
  const contender = waitingCli({ ...f, args: ["install"] });
  expect((await contender.result).exitCode).toBe(4);
  expect(await acquiredBy(f.target, contender.pid)).toBe(false);
  expect(readFileSync(owner, "utf8")).toBe(retained);
}, 10_000);
