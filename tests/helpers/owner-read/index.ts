/** Bounded real FIFO/regular metadata probes run only in joined owned children (§14). */
import { join, resolve } from "node:path";
import { makeTempDir } from "../fixtures.ts";

export function ownerReadChild(kind: string): {
  reason: string;
  ready: boolean;
  exit: number;
  joined: boolean;
  stderr: string;
} {
  const target = join(makeTempDir(), "target");
  const result = Bun.spawnSync(
    [
      "python3",
      join(import.meta.dir, "controller.py"),
      process.execPath,
      resolve(import.meta.dir, "../../../src/util/advisory-lock.ts"),
      target,
      kind,
    ],
    { timeout: 12_000 },
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString());
}
