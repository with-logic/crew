/** Liveness probes cannot block on owner special files or trust oversized records (§14). */
import { expect, test } from "bun:test";
import { ownerReadChild } from "../../helpers/owner-read/index.ts";

for (const kind of ["fifo", "symlink-fifo", "oversized", "malformed", "absent"]) {
  test(`C-CONC-06 owner liveness admission is bounded for ${kind}`, () => {
    const result = ownerReadChild(kind);
    expect(result.ready, JSON.stringify(result)).toBe(true);
    expect(result.joined).toBe(true);
    expect(result.reason, JSON.stringify(result)).toBe("exited");
    expect(result.exit, result.stderr).toBe(0);
  });
}
