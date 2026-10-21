/** Native regular-file hashing keeps bounded memory without changing digest bytes (§12.1). */

import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURE_TIMEOUT_MS, makeTempDir } from "../helpers/fixtures.ts";

const CHUNK_BYTES = 64 * 1024;
const FILE_CHUNKS = 512;
const MEMORY_DELTA_BYTES = 64 * 1024 * 1024;

type Measurement = {
  readonly names: readonly string[];
  readonly digest: string;
  readonly maxRSS: number;
};

/** A lightweight launcher prevents the test runner's resident memory becoming the child's floor. */
function measure(directory: string) {
  const hashModule = import.meta.resolve("../../src/hash/content.ts");
  const hashScript = `
    import { readdirSync } from "node:fs";
    import { hashDirectory } from ${JSON.stringify(hashModule)};
    console.log(JSON.stringify({
      names: readdirSync(${JSON.stringify(directory)}).sort(),
      digest: hashDirectory(${JSON.stringify(directory)})
    }));
  `;
  const launcher = `
    const child = Bun.spawnSync([process.execPath, "--eval", ${JSON.stringify(hashScript)}]);
    if (child.exitCode !== 0) {
      process.stderr.write(child.stderr);
      process.exit(child.exitCode);
    }
    console.log(JSON.stringify({
      ...JSON.parse(child.stdout.toString()),
      maxRSS: child.resourceUsage.maxRSS
    }));
  `;
  return Bun.spawnSync([process.execPath, "--eval", launcher]);
}

test(
  "native hashing of ten 32 MiB files stays within 64 MiB of empty-file memory",
  () => {
    const root = makeTempDir("crew-hash-resources-");
    const empty = join(root, "empty");
    const large = join(root, "large");
    mkdirSync(empty);
    mkdirSync(large);
    try {
      const names: string[] = [];
      const emptyDigest = createHash("sha256");
      const largeDigest = createHash("sha256");
      const emptyFileSha = createHash("sha256").digest("hex");
      for (let file = 0; file < 10; file++) {
        const name = `file-${file}.bin`;
        names.push(name);
        writeFileSync(join(empty, name), "");
        writeFileSync(join(large, name), "");
        const chunk = Buffer.alloc(CHUNK_BYTES, file + 1);
        const fileDigest = createHash("sha256");
        for (let part = 0; part < FILE_CHUNKS; part++) {
          appendFileSync(join(large, name), chunk);
          fileDigest.update(chunk);
        }
        emptyDigest.update(`${name}\0${emptyFileSha}\n`);
        largeDigest.update(`${name}\0${fileDigest.digest("hex")}\n`);
      }
      const baselineResult = measure(empty);
      const measuredResult = measure(large);
      expect(baselineResult.exitCode, baselineResult.stderr.toString()).toBe(0);
      expect(measuredResult.exitCode, measuredResult.stderr.toString()).toBe(0);
      const baseline = JSON.parse(baselineResult.stdout.toString()) as Measurement;
      const measured = JSON.parse(measuredResult.stdout.toString()) as Measurement;
      expect(baseline.names).toEqual(names);
      expect(measured.names).toEqual(names);
      expect(baseline.digest).toBe(`sha256:${emptyDigest.digest("hex")}`);
      expect(measured.digest).toBe(`sha256:${largeDigest.digest("hex")}`);
      // Bun's subprocess ResourceUsage.maxRSS is bytes on both supported platforms.
      expect(
        measured.maxRSS - baseline.maxRSS,
        JSON.stringify({ baseline, measured }),
      ).toBeLessThan(MEMORY_DELTA_BYTES);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  FIXTURE_TIMEOUT_MS,
);
