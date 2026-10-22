/** Actual filesystem case aliases share locks without conflating distinct bases (§14). */
import { expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { withTargetLocks } from "../../../src/agents/target-lock/index.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

test("C-CONC-06 case spellings follow filesystem identity rather than lowercase strings", () => {
  const root = makeTempDir();
  const bases = [join(root, "MixedCase"), join(root, "mixedcase")];
  // These are one directory on a case-insensitive volume and two on a sensitive volume.
  for (const path of bases) mkdirSync(path, { recursive: true });
  const previous = process.env["CREW_LOCK_TIMEOUT_MS"];
  process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
  try {
    withTargetLocks(
      bases.map((path) => ({ path, create: false })),
      () => {
        for (const path of bases) expect(existsSync(join(path, ".crew-target.lock"))).toBe(true);
      },
    );
    for (const path of bases) expect(existsSync(join(path, ".crew-target.lock"))).toBe(false);
  } finally {
    if (previous === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
    else process.env["CREW_LOCK_TIMEOUT_MS"] = previous;
  }
});
