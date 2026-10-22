/** Target admission rejects reserved lock-directory links (§14, C-CONC-06). */
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { withTargetLocks } from "../../../src/agents/target-lock/index.ts";
import { makeTempDir } from "../../helpers/fixtures.ts";

for (const link of [false, true]) {
  test(`C-CONC-06 a reserved lock-directory link is rejected (dangling=${link})`, () => {
    const base = makeTempDir();
    const referent = join(makeTempDir(), "outside");
    if (!link) mkdirSync(referent);
    const before = link ? null : statSync(referent).mtimeMs;
    symlinkSync(referent, join(base, ".crew-target.lock"));
    const previous = process.env["CREW_LOCK_TIMEOUT_MS"];
    process.env["CREW_LOCK_TIMEOUT_MS"] = "100";
    try {
      let failure: unknown;
      try {
        withTargetLocks([{ path: base, create: false }], () => {});
      } catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: "usage_error" });
      if (link) expect(existsSync(referent)).toBe(false);
      else expect(statSync(referent).mtimeMs).toBe(before!);
    } finally {
      if (previous === undefined) delete process.env["CREW_LOCK_TIMEOUT_MS"];
      else process.env["CREW_LOCK_TIMEOUT_MS"] = previous;
    }
  });
}
